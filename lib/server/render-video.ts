// Server-side video renderer: draws frames with @napi-rs/canvas, renders the
// soundtrack with node-web-audio-api's OfflineAudioContext, and muxes both into
// an H.264/AAC MP4 with ffmpeg. Frames are split across several processes
// (one per CPU core) and the encoded segments are concatenated losslessly.
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import { OfflineAudioContext } from "node-web-audio-api";
import { SoundEngine, type VoiceBank } from "../engine/audio";
import { Renderer, type CanvasLike, type Platform } from "../engine/renderer";
import { totalDuration, type ProjectSettings, type StoryPlan } from "../engine/types";
import { decodeAudio, SAMPLE_RATE } from "./audio-decode";

export const FPS = 30;
const AUDIO_TAIL = 0.6;
const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";

let fontsLoaded = false;
export function registerFonts() {
  if (fontsLoaded) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  GlobalFonts.registerFromPath(path.join(dir, "Oswald-SemiBold.ttf"), "Oswald");
  GlobalFonts.registerFromPath(path.join(dir, "SpecialElite.ttf"), "Special Elite");
  GlobalFonts.registerFromPath(path.join(dir, "Creepster.ttf"), "Creepster");
  GlobalFonts.registerFromPath(path.join(dir, "PlusJakartaSans-SemiBold.ttf"), "Plus Jakarta Sans");
  fontsLoaded = true;
}

export interface RenderInput {
  plan: StoryPlan;
  settings: ProjectSettings;
  /** Maps a media URL (image / narration) to a local file path, or null if not allowed. */
  resolveMedia(url: string): string | null;
  outFile: string;
  posterFile?: string;
  onProgress?(fraction: number, stage: string): void;
  /** Number of frame-rendering processes. Defaults to RENDER_PROCESSES or the CPU count. */
  processes?: number;
}

/** Everything a frame-range worker needs; serialisable so it can cross a process boundary. */
export interface SegmentJob {
  plan: StoryPlan;
  settings: ProjectSettings;
  images: Record<string, string>; // url -> file
  from: number; // first frame (inclusive)
  to: number; // last frame (exclusive)
  outFile: string; // video-only .mp4
  posterFile?: string;
  posterFrame?: number;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim()}`))));
  });
}

export async function renderVideo(input: RenderInput): Promise<{ duration: number; frames: number }> {
  const { plan, settings, onProgress = () => {} } = input;
  const total = totalDuration(plan);
  if (!plan.scenes.length || total <= 0) throw new Error("Nothing to render");

  // ---- assets ----
  onProgress(0.01, "Loading assets");
  const images: Record<string, string> = {};
  const voices: VoiceBank = new Map();
  for (const s of plan.scenes) {
    if (s.image && !images[s.image]) {
      const file = input.resolveMedia(s.image);
      if (file) images[s.image] = file;
    }
    if (s.narration && !voices.has(s.narration.url)) {
      const file = input.resolveMedia(s.narration.url);
      if (file) voices.set(s.narration.url, await decodeAudio(await readFile(file)));
    }
  }

  // ---- audio ----
  onProgress(0.03, "Mixing sound");
  const length = Math.ceil((total + AUDIO_TAIL) * SAMPLE_RATE);
  const actx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
  const engine = new SoundEngine(actx as unknown as BaseAudioContext);
  engine.play(plan, { music: settings.music, sfx: settings.sfx, voice: settings.voice }, 0, voices, 0);
  const mixed = (await actx.startRendering()) as unknown as AudioBuffer;
  const base = input.outFile.replace(/\.mp4$/, "");
  const wavFile = `${base}.wav`;
  await writeFile(wavFile, encodeWav(mixed));
  onProgress(0.08, "Rendering frames");

  // ---- video segments ----
  const frames = Math.ceil(total * FPS);
  const wanted = input.processes ?? (Number(process.env.RENDER_PROCESSES) || availableParallelism());
  const procs = Math.max(1, Math.min(wanted, Math.ceil(frames / 60)));
  const per = Math.ceil(frames / procs);
  const jobs: SegmentJob[] = Array.from({ length: procs }, (_, i) => ({
    plan,
    settings,
    images,
    from: i * per,
    to: Math.min(frames, (i + 1) * per),
    outFile: `${base}.part${i}.mp4`,
  })).filter((j) => j.to > j.from);
  const posterFrame = Math.min(Math.round(1.4 * FPS), frames - 1);
  const owner = jobs.find((j) => posterFrame >= j.from && posterFrame < j.to);
  if (owner && input.posterFile) Object.assign(owner, { posterFile: input.posterFile, posterFrame });

  const done = new Array(jobs.length).fill(0);
  const report = () => onProgress(0.08 + 0.87 * (done.reduce((a, b) => a + b, 0) / frames), "Rendering frames");
  try {
    if (jobs.length === 1) {
      await renderSegment(jobs[0], (n) => ((done[0] = n), report()));
    } else {
      await Promise.all(jobs.map((job, i) => spawnSegment(job, (n) => ((done[i] = n), report()))));
    }

    // ---- mux ----
    onProgress(0.96, "Encoding");
    const list = `${base}.txt`;
    await writeFile(list, jobs.map((j) => `file '${j.outFile.replace(/'/g, "'\\''")}'`).join("\n"));
    try {
      await run(ffmpegBin(), [
        "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", list,
        "-i", wavFile,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", total.toFixed(3), "-movflags", "+faststart",
        input.outFile,
      ]);
    } finally {
      await rm(list, { force: true });
    }
  } finally {
    await rm(wavFile, { force: true });
    await Promise.all(jobs.map((j) => rm(j.outFile, { force: true })));
  }
  onProgress(1, "Done");
  return { duration: total, frames };
}

/** Run one segment in a child process (true parallelism for the CPU-bound rasterizer). */
function spawnSegment(job: SegmentJob, onFrames: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const entry = path.join(process.cwd(), "lib", "server", "render-segment.ts");
    const p = spawn(process.execPath, ["--no-warnings", "--import", "tsx", entry], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "2" },
    });
    let err = "";
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const l of lines) if (l.startsWith("frames ")) onFrames(Number(l.slice(7)));
    });
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`render segment failed (${code}): ${err.trim()}`))));
    p.stdin.end(JSON.stringify(job));
  });
}

/** Render frames [from, to) to a video-only MP4. */
export async function renderSegment(job: SegmentJob, onFrames: (n: number) => void = () => {}): Promise<void> {
  registerFonts();
  const { plan, settings } = job;
  const loaded = new Map<string, Image>();
  for (const [url, file] of Object.entries(job.images)) loaded.set(url, await loadImage(await readFile(file)));

  const width = settings.quality === 720 ? 720 : 1080;
  const height = Math.round((width * 16) / 9);
  const canvas = createCanvas(width, height);
  const platform: Platform = {
    createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
    image: (src) => loaded.get(src) ?? null,
  };
  const renderer = new Renderer(canvas as unknown as CanvasLike, platform);
  const opts = { captionStyle: settings.captionStyle, showTitle: settings.showTitle, grain: false };

  const ff = spawn(
    ffmpegBin(),
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "pipe:0",
      // Film grain is added here: cheaper than compositing it on the canvas.
      "-vf", "noise=alls=4:allf=t",
      // Quality-targeted, but capped near the bitrate Shorts/Reels/TikTok recommend for 1080p.
      "-c:v", "libx264", "-preset", process.env.X264_PRESET || "veryfast", "-crf", "21",
      "-maxrate", settings.quality === 720 ? "5M" : "8M", "-bufsize", "16M", "-pix_fmt", "yuv420p",
      "-threads", process.env.X264_THREADS || "1", "-an",
      job.outFile,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  ff.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  let closed = false;
  const exited = new Promise<number>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => {
      closed = true;
      resolve(code ?? 1);
    });
  });
  const write = async (b: Buffer) => {
    if (closed) throw new Error(`ffmpeg exited early: ${stderr}`);
    if (!ff.stdin.write(b)) await new Promise<void>((r) => ff.stdin.once("drain", r));
  };

  // JPEG encoding runs on libuv threads (much faster than raw readback at 1080p);
  // a small window keeps a few encodes in flight while writes stay in order.
  const WINDOW = 4;
  const inflight: Promise<Buffer>[] = [];
  try {
    for (let i = job.from; i < job.to; i++) {
      renderer.render(plan, i / FPS, opts);
      if (i === job.posterFrame && job.posterFile) await writeFile(job.posterFile, canvas.toBuffer("image/jpeg", 82));
      inflight.push(canvas.encode("jpeg", 92));
      if (inflight.length >= WINDOW) await write(await inflight.shift()!);
      if ((i - job.from) % 10 === 0) onFrames(i - job.from);
    }
    while (inflight.length) await write(await inflight.shift()!);
  } finally {
    ff.stdin.end();
  }
  const code = await exited;
  if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${stderr.trim()}`);
  onFrames(job.to - job.from);
}

/** 16-bit PCM WAV from an AudioBuffer. */
export function encodeWav(buf: AudioBuffer): Buffer {
  const ch = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const out = Buffer.alloc(44 + n * ch * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * ch * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(ch, 22);
  out.writeUInt32LE(buf.sampleRate, 24);
  out.writeUInt32LE(buf.sampleRate * ch * 2, 28);
  out.writeUInt16LE(ch * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * ch * 2, 40);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  return out;
}
