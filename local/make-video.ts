// Local, key-free video maker: plan.json (+ optional images/voice) -> MP4.
// No database, Redis, web app or API keys. Built for low-end laptops (2 cores, no GPU).
//
//   npm run short -- <project-folder-name> [--quality 720|1080] [--voice auto|windows|piper|none] [--concurrency N]
//
// See local/README.md for setup and local/AGENT_GUIDE.md for the plan.json format.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { decodeAudio } from "../lib/server/audio-decode";
import { planLocally } from "../lib/engine/planner";
import { encodeWav, mixSoundtrack, SAMPLE_RATE } from "../lib/engine/soundtrack";
import { OfflineAudioContext } from "node-web-audio-api";
import type { VoiceBank } from "../lib/engine/audio";
import {
  EFFECTS,
  fitToNarration,
  MOODS,
  SFX,
  totalDuration,
  VISUALS,
  type CaptionStyle,
  type Scene,
  type StoryPlan,
} from "../lib/engine/types";
import { COMPOSITION_ID } from "../remotion/Root";
import type { HorrorShortProps } from "../remotion/HorrorShort";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = path.join(ROOT, "local", "projects");
const CACHE = path.join(ROOT, "local", ".cache");
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_EXT = [".wav", ".mp3"];

type VoiceEngine = "auto" | "windows" | "piper" | "none";

interface LocalScene {
  text: string;
  visual?: string;
  mood?: string;
  effects?: string[];
  sfx?: string[];
  duration?: number;
  imagePrompt?: string;
  image?: string;
}

interface LocalPlan {
  title?: string;
  captionStyle?: CaptionStyle;
  showTitle?: boolean;
  music?: number;
  sfxVolume?: number;
  voice?: { engine?: VoiceEngine; windowsVoice?: string; rate?: number; piperModel?: string };
  scenes: LocalScene[];
}

// ---------- CLI ----------

function parseArgs(argv: string[]) {
  const opts = { slug: "", quality: 1080 as 720 | 1080, voice: undefined as VoiceEngine | undefined, concurrency: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quality") opts.quality = argv[++i] === "720" ? 720 : 1080;
    else if (a === "--draft") opts.quality = 720;
    else if (a === "--voice") opts.voice = argv[++i] as VoiceEngine;
    else if (a === "--concurrency") opts.concurrency = Number(argv[++i]) || 0;
    else if (!a.startsWith("--")) opts.slug = a;
  }
  return opts;
}

const log = (msg: string) => console.log(`[short] ${msg}`);

// Keep the laptop usable while rendering: Chrome and ffmpeg inherit this priority.
function lowerPriority() {
  try {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* not permitted; ignore */
  }
}

// ---------- plan ----------

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

async function loadPlan(dir: string): Promise<LocalPlan> {
  const planFile = path.join(dir, "plan.json");
  if (existsSync(planFile)) {
    const raw = JSON.parse(await readFile(planFile, "utf8")) as LocalPlan;
    if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) throw new Error("plan.json needs a non-empty \"scenes\" array");
    return raw;
  }
  // Fallback: plain story text, planned by the offline rule-based planner.
  const storyFile = path.join(dir, "story.txt");
  if (existsSync(storyFile)) {
    const story = await readFile(storyFile, "utf8");
    const plan = planLocally(story, 45);
    log(`no plan.json; planned ${plan.scenes.length} scenes from story.txt`);
    return { title: plan.title, scenes: plan.scenes.map((s) => ({ ...s })) };
  }
  throw new Error(`No plan.json or story.txt in ${dir}`);
}

function toScene(s: LocalScene, i: number): Scene {
  return {
    id: `s${i + 1}`,
    text: String(s.text ?? "").trim(),
    visual: pick(s.visual, VISUALS, "void"),
    mood: pick(s.mood, MOODS, "dread"),
    duration: Math.min(20, Math.max(1.5, Number(s.duration) || 3.5)),
    effects: [...new Set((s.effects ?? []).filter((e): e is Scene["effects"][number] => EFFECTS.includes(e as never)))],
    sfx: [...new Set((s.sfx ?? []).filter((e): e is Scene["sfx"][number] => SFX.includes(e as never)))],
    imagePrompt: s.imagePrompt,
  };
}

/** images/01.png, images/1.jpg, images/scene-1.webp ... or the scene's explicit "image" path. */
async function findAsset(dir: string, sub: string, index: number, exts: string[], explicit?: string): Promise<string | null> {
  if (explicit) {
    const p = path.resolve(dir, explicit);
    if (existsSync(p)) return p;
    log(`warning: ${explicit} not found`);
  }
  const folder = path.join(dir, sub);
  if (!existsSync(folder)) return null;
  const n = index + 1;
  const names = [String(n).padStart(2, "0"), String(n), `scene-${n}`, `scene-${String(n).padStart(2, "0")}`];
  const files = await readdir(folder);
  for (const name of names) {
    const hit = files.find((f) => exts.includes(path.extname(f).toLowerCase()) && path.basename(f, path.extname(f)).toLowerCase() === name);
    if (hit) return path.join(folder, hit);
  }
  return null;
}

// ---------- voice ----------

function run(cmd: string, args: string[], input?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input === undefined ? "ignore" : "pipe", "ignore", "pipe"], windowsHide: true });
    let err = "";
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 400)}`))));
    if (input !== undefined) p.stdin!.end(input, "utf8");
  });
}

// Windows' built-in offline speech engine (System.Speech). Nothing to install.
const WINDOWS_TTS = `
param([string]$TextFile, [string]$Out, [int]$Rate = -2, [string]$Voice = "")
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) { try { $s.SelectVoice($Voice) } catch { } }
$s.Rate = $Rate
$s.SetOutputToWaveFile($Out)
$s.Speak([IO.File]::ReadAllText($TextFile))
$s.Dispose()
`;

async function synthWindows(text: string, out: string, rate: number, voice: string) {
  const work = path.join(CACHE, "tts");
  await mkdir(work, { recursive: true });
  const script = path.join(work, "speak.ps1");
  const textFile = path.join(work, "line.txt");
  await writeFile(script, WINDOWS_TTS, "utf8");
  await writeFile(textFile, text, "utf8");
  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-TextFile", textFile, "-Out", out, "-Rate", String(rate), "-Voice", voice]);
}

async function synthPiper(text: string, out: string, model: string) {
  const exe = process.env.PIPER_EXE || "piper";
  await run(exe, ["--model", model, "--output_file", out], text);
}

function resolveEngine(requested: VoiceEngine, piperModel?: string): Exclude<VoiceEngine, "auto"> {
  if (requested !== "auto") return requested;
  if (piperModel && existsSync(piperModel)) return "piper";
  if (process.platform === "win32") return "windows";
  return "none";
}

// ---------- render ----------

let bundlePromise: Promise<string> | null = null;
function getBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: path.join(ROOT, "remotion", "index.ts"),
    publicDir: path.join(ROOT, "public"),
    outDir: path.join(CACHE, "bundle"),
  });
  return bundlePromise;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) {
    const list = existsSync(PROJECTS) ? (await readdir(PROJECTS)).join(", ") : "none";
    throw new Error(`Usage: npm run short -- <project> [--draft] [--voice windows|piper|none]\nProjects: ${list}`);
  }
  lowerPriority();
  const dir = path.join(PROJECTS, args.slug);
  if (!existsSync(dir)) throw new Error(`Project folder not found: ${dir}`);
  const local = await loadPlan(dir);
  const started = Date.now();

  const voiceCfg = local.voice ?? {};
  const piperModel = voiceCfg.piperModel ? path.resolve(dir, voiceCfg.piperModel) : process.env.PIPER_MODEL;
  const engine = resolveEngine(args.voice ?? voiceCfg.engine ?? "auto", piperModel);
  log(`project "${args.slug}": ${local.scenes.length} scenes, voice=${engine}, ${args.quality}p`);

  const voiceDir = path.join(dir, "voice");
  await mkdir(voiceDir, { recursive: true });
  const stage = path.join(CACHE, "stage", args.slug);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });

  // 1. Scenes, images and narration.
  const voices: VoiceBank = new Map();
  const imageFiles = new Map<string, string>();
  const scenes: Scene[] = [];
  const prompts: string[] = [];
  for (let i = 0; i < local.scenes.length; i++) {
    const src = local.scenes[i];
    const scene = toScene(src, i);
    if (scene.imagePrompt) prompts.push(`Scene ${String(i + 1).padStart(2, "0")}  ->  save as images/${String(i + 1).padStart(2, "0")}.png\n${scene.imagePrompt}\n`);

    const img = await findAsset(dir, "images", i, IMAGE_EXT, src.image);
    if (img) {
      const key = `img-${i + 1}${path.extname(img).toLowerCase()}`;
      imageFiles.set(key, img);
      scene.imageKey = key;
    }

    if (scene.text) {
      // A recording you made yourself (voice/01.wav) always wins; otherwise synthesize and cache.
      let clip = await findAsset(dir, "voice", i, AUDIO_EXT);
      const generated = path.join(voiceDir, `${String(i + 1).padStart(2, "0")}.tts.wav`);
      const stamp = generated + ".txt";
      if (!clip && engine !== "none") {
        const cached = existsSync(generated) && existsSync(stamp) && (await readFile(stamp, "utf8")) === `${engine}|${scene.text}`;
        if (!cached) {
          log(`voice ${i + 1}/${local.scenes.length}`);
          if (engine === "windows") await synthWindows(scene.text, generated, voiceCfg.rate ?? -2, voiceCfg.windowsVoice ?? "");
          else await synthPiper(scene.text, generated, piperModel!);
          await writeFile(stamp, `${engine}|${scene.text}`, "utf8");
        }
        clip = generated;
      }
      if (clip) {
        const buf = await decodeAudio(await readFile(clip));
        const key = `voice-${i + 1}`;
        voices.set(key, buf);
        scene.narration = { key, duration: buf.duration, voice: engine, text: scene.text };
      }
    }
    scenes.push(scene);
  }
  if (prompts.length) await writeFile(path.join(dir, "image-prompts.txt"), prompts.join("\n"), "utf8");

  const plan: StoryPlan = { title: String(local.title ?? args.slug).slice(0, 80), scenes: fitToNarration(scenes) };
  const seconds = totalDuration(plan);
  log(`timeline ${seconds.toFixed(1)}s, ${imageFiles.size}/${scenes.length} scenes have images (others use built-in art)`);
  if (seconds > 60) log("warning: longer than 60s; shorten the narration if this is for Shorts/Reels");

  // 2. Soundtrack: procedural score + SFX + narration.
  log("mixing soundtrack");
  const ctx = (ch: number, len: number, rate: number) =>
    new OfflineAudioContext({ numberOfChannels: ch, length: len, sampleRate: rate }) as unknown as globalThis.OfflineAudioContext;
  const mixed = await mixSoundtrack(ctx, plan, { music: local.music ?? 1, sfx: local.sfxVolume ?? 1, voice: 1 }, voices);
  if (mixed.sampleRate !== SAMPLE_RATE) log(`note: sample rate ${mixed.sampleRate}`);

  // 3. Bundle once (cached across runs), then copy this project's media into the bundle's public folder.
  log("preparing renderer (first run takes a minute)");
  const serveUrl = await getBundle();
  const mediaDir = path.join(serveUrl, "public", "_local", args.slug);
  await rm(mediaDir, { recursive: true, force: true });
  await mkdir(mediaDir, { recursive: true });
  await writeFile(path.join(mediaDir, "soundtrack.wav"), encodeWav(mixed));
  const media: Record<string, string> = {};
  for (const [key, file] of imageFiles) {
    await copyFile(file, path.join(mediaDir, key));
    media[key] = `/public/_local/${args.slug}/${key}`;
  }

  const inputProps: HorrorShortProps = {
    plan,
    settings: { captionStyle: local.captionStyle ?? "bold", showTitle: local.showTitle ?? true, quality: args.quality },
    soundtrackUrl: `/public/_local/${args.slug}/soundtrack.wav`,
    media,
  };
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  // Each parallel tab costs ~400 MB; stay at 1 on busy machines.
  const freeGb = os.freemem() / 1024 ** 3;
  const concurrency = args.concurrency || (freeGb > 6 && os.cpus().length >= 4 ? 2 : 1);

  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps, browserExecutable });
  const out = path.join(dir, "final.mp4");
  log(`rendering ${composition.durationInFrames} frames with ${concurrency} tab(s)... you can keep using the laptop`);
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: out,
    inputProps,
    browserExecutable,
    concurrency,
    crf: 21,
    encodingMaxRate: args.quality === 720 ? "5M" : "8M",
    encodingBufferSize: "16M",
    x264Preset: "veryfast",
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= last + 5) {
        last = pct;
        log(`${pct}%`);
      }
    },
  });
  await renderStill({
    composition,
    serveUrl,
    output: path.join(dir, "thumbnail.jpg"),
    inputProps,
    browserExecutable,
    frame: Math.min(Math.round(1.4 * composition.fps), composition.durationInFrames - 1),
    imageFormat: "jpeg",
    jpegQuality: 85,
  });
  await rm(mediaDir, { recursive: true, force: true });

  const size = (await stat(out)).size / 1024 ** 2;
  log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${path.relative(ROOT, out)} (${size.toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(`[short] ERROR: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
