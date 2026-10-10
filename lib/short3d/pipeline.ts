// Local, free pipeline for 3D cartoon horror shorts:
//   short.json → Kokoro narration (CPU) → timing → soundtrack mix → Remotion 3D render → MP4.
// Runs on Windows, macOS and Linux without a GPU.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, type ChromiumOptions } from "@remotion/renderer";
import { OfflineAudioContext } from "node-web-audio-api";
import type { VoiceBank } from "../engine/audio";
import { encodeWav, mixSoundtrack } from "../engine/soundtrack";
import { MAX_DURATION, MIN_DURATION, NARRATION_LEAD, NARRATION_TAIL, type StoryPlan } from "../engine/types";
import { formatIssues, ShortSchema, type ResolvedShort, type ShortSpec } from "./spec";

export const ROOT = process.cwd();
export const SHORTS_DIR = path.join(ROOT, "shorts");
const ENTRY = path.join(ROOT, "remotion", "short3d", "index.ts");
const COMPOSITION = "HorrorShort3D";
const FPS = 30;

export const shortDir = (name: string) => path.join(SHORTS_DIR, name);
const log = (msg: string) => console.log(`[short] ${msg}`);

// ---------- spec ----------

export async function loadSpec(name: string): Promise<ShortSpec> {
  const file = path.join(shortDir(name), "short.json");
  if (!existsSync(file)) throw new Error(`No ${path.relative(ROOT, file)} — create it first (npm run short -- new ${name}).`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`short.json is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = ShortSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`short.json has problems:\n${formatIssues(parsed.error)}`);
  for (const s of parsed.data.scenes) {
    if (s.custom && !existsSync(path.join(shortDir(name), s.custom))) throw new Error(`Scene ${s.id}: custom file ${s.custom} not found.`);
  }
  return parsed.data;
}

// ---------- narration (Kokoro, local CPU) ----------

type Kokoro = { generate(text: string, o: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number; save(p: string): Promise<void> | void }> };
let kokoro: Promise<Kokoro> | null = null;
function tts(): Promise<Kokoro> {
  kokoro ??= (async () => {
    log("Loading Kokoro voice model (first run downloads ~90 MB)…");
    const { KokoroTTS } = await import("kokoro-js");
    return (await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" })) as unknown as Kokoro;
  })();
  return kokoro;
}

export const VOICES = [
  "am_onyx", "am_michael", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_puck",
  "af_heart", "af_bella", "af_nicole", "af_sky", "af_sarah", "af_nova", "af_river",
  "bm_george", "bm_lewis", "bm_daniel", "bm_fable", "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
];

async function narrate(name: string, spec: ShortSpec) {
  const cache = path.join(shortDir(name), ".cache");
  await mkdir(cache, { recursive: true });
  if (!VOICES.includes(spec.voice)) throw new Error(`Unknown voice "${spec.voice}". Try one of: ${VOICES.join(", ")}`);
  const out = new Map<string, { file: string; duration: number }>();
  for (const s of spec.scenes) {
    const text = s.narration.trim();
    if (!text) continue;
    const key = createHash("sha1").update(`${spec.voice}|${spec.speed}|${text}`).digest("hex").slice(0, 16);
    const file = path.join(cache, `voice-${key}.wav`);
    if (!existsSync(file)) {
      log(`Narrating ${s.id}: "${text.slice(0, 50)}${text.length > 50 ? "…" : ""}"`);
      const audio = await (await tts()).generate(text, { voice: spec.voice, speed: spec.speed });
      await audio.save(file);
    }
    out.set(s.id, { file, duration: await wavDuration(file) });
  }
  return out;
}

async function wavDuration(file: string): Promise<number> {
  const buf = await readFile(file);
  // RIFF: byte rate at 28, data chunk size follows the "data" tag.
  const byteRate = buf.readUInt32LE(28);
  const dataAt = buf.indexOf("data", 12);
  return buf.readUInt32LE(dataAt + 4) / byteRate;
}

// ---------- timing + soundtrack ----------

export function resolveTiming(spec: ShortSpec, voices: Map<string, { file: string; duration: number }>): ResolvedShort {
  let start = 0;
  const scenes = spec.scenes.map((s) => {
    const v = voices.get(s.id);
    const fitted = v ? Math.max(1.5, v.duration + NARRATION_LEAD + NARRATION_TAIL) : 3;
    const duration = Math.round((s.duration ?? fitted) * 100) / 100;
    const scene = { ...s, duration, start, narrationFile: v?.file, narrationDuration: v?.duration };
    start += duration;
    return scene;
  });
  return { ...spec, scenes, soundtrack: null };
}

export const totalOf = (r: ResolvedShort) => r.scenes.reduce((a, s) => a + s.duration, 0);

const ctxFactory = (c: number, len: number, sr: number) => new OfflineAudioContext({ numberOfChannels: c, length: len, sampleRate: sr }) as unknown as globalThis.OfflineAudioContext;

async function buildSoundtrack(resolved: ResolvedShort, outFile: string) {
  const voices: VoiceBank = new Map();
  for (const s of resolved.scenes) {
    if (!s.narrationFile) continue;
    const data = await readFile(s.narrationFile);
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    voices.set(s.narrationFile, await ctxFactory(2, 1, 48000).decodeAudioData(ab));
  }
  // Reuse the procedural score/SFX engine: map 3D scenes onto its plan format.
  const plan: StoryPlan = {
    title: resolved.title,
    scenes: resolved.scenes.map((s) => ({
      id: s.id,
      text: s.narration,
      visual: "void",
      mood: s.mood,
      duration: s.duration,
      effects: [],
      sfx: s.sfx,
      narration: s.narrationFile ? { key: s.narrationFile, duration: s.narrationDuration ?? 0, voice: resolved.voice, text: s.narration } : undefined,
    })),
  };
  const mixed = await mixSoundtrack(ctxFactory, plan, { music: resolved.music, sfx: resolved.sfxVolume, voice: resolved.voiceVolume }, voices);
  await writeFile(outFile, encodeWav(mixed));
}

// ---------- bundle + render ----------

async function prepareBuild(name: string, spec: ShortSpec) {
  const build = path.join(shortDir(name), ".build");
  const pub = path.join(build, "public");
  await mkdir(pub, { recursive: true });
  await cp(path.join(ROOT, "public", "fonts"), path.join(pub, "fonts"), { recursive: true });
  // Registry of hand-written scenes for the virtual module "short3d-custom-scenes".
  const customs = [...new Set(spec.scenes.map((s) => s.custom).filter(Boolean) as string[])];
  const registry = [
    ...customs.map((c, i) => `import C${i} from ${JSON.stringify(path.join(shortDir(name), c).split(path.sep).join("/"))};`),
    `export const CUSTOM_SCENES = { ${customs.map((c, i) => `${JSON.stringify(c)}: C${i}`).join(", ")} };`,
  ].join("\n");
  const registryFile = path.join(build, "custom-scenes.ts");
  await writeFile(registryFile, registry + "\n");
  return { build, pub, registryFile };
}

function chromium(): { chromiumOptions: ChromiumOptions; browserExecutable: string | null } {
  // Without a GPU, Chrome renders WebGL in software. "angle" is Remotion's recommendation for
  // Three.js and falls back to software (WARP/SwiftShader) on Windows; "swangle" is the
  // explicit software path on Linux.
  const gl = (process.env.REMOTION_GL as ChromiumOptions["gl"]) || (process.platform === "linux" ? "swangle" : "angle");
  return { chromiumOptions: { gl, enableMultiProcessOnLinux: true }, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null };
}

async function bundleFor(registryFile: string, publicDir: string) {
  log("Bundling the 3D composition…");
  return bundle({
    entryPoint: ENTRY,
    publicDir,
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "short3d-custom-scenes": registryFile } },
    }),
  });
}

export interface PrepareResult {
  resolved: ResolvedShort;
  serveUrl: string;
  dir: string;
}

/** Narration, timing, soundtrack and bundle — everything before frames are drawn. */
export async function prepare(name: string, opts: { soundtrack: boolean }): Promise<PrepareResult> {
  const spec = await loadSpec(name);
  const voices = await narrate(name, spec);
  const resolved = resolveTiming(spec, voices);
  const total = totalOf(resolved);
  log(`${resolved.scenes.length} scenes, ${total.toFixed(1)}s total`);
  if (total < MIN_DURATION || total > MAX_DURATION) {
    const fix = total > MAX_DURATION ? "shorten the narration or remove scenes" : "add scenes or longer narration";
    throw new Error(`Total length is ${total.toFixed(1)}s; it must be between ${MIN_DURATION} and ${MAX_DURATION}s (${fix}).`);
  }
  const { pub, registryFile } = await prepareBuild(name, spec);
  if (opts.soundtrack) {
    log("Mixing soundtrack (narration + score + sound effects)…");
    await buildSoundtrack(resolved, path.join(pub, "soundtrack.wav"));
    resolved.soundtrack = "soundtrack.wav";
  }
  // Paths to local files never need to reach the browser.
  resolved.scenes = resolved.scenes.map(({ narrationFile: _f, ...s }) => s);
  const serveUrl = await bundleFor(registryFile, pub);
  return { resolved, serveUrl, dir: shortDir(name) };
}

/** One still per scene (and optional extra moments) so Claude can look at the result before a full render. */
export async function preview(name: string, opts: { at?: number[] } = {}) {
  const { resolved, serveUrl, dir } = await prepare(name, { soundtrack: false });
  const { chromiumOptions, browserExecutable } = chromium();
  const inputProps = { short: resolved, drawScale: 1 };
  const composition = await selectComposition({ serveUrl, id: COMPOSITION, inputProps, chromiumOptions, browserExecutable });
  const outDir = path.join(dir, "preview");
  await mkdir(outDir, { recursive: true });
  const frames: { label: string; frame: number }[] = [];
  for (const s of resolved.scenes) {
    for (const f of opts.at ?? [0.55]) frames.push({ label: `${s.id}-${Math.round(f * 100)}`, frame: Math.round((s.start + s.duration * f) * FPS) });
  }
  const files: string[] = [];
  for (const { label, frame } of frames) {
    const output = path.join(outDir, `${label}.png`);
    await renderStill({ composition, serveUrl, output, frame: Math.min(frame, composition.durationInFrames - 1), inputProps, chromiumOptions, browserExecutable, scale: 0.5 });
    files.push(path.relative(ROOT, output));
  }
  log(`Preview stills:\n${files.map((f) => `  ${f}`).join("\n")}`);
  return files;
}

export async function render(name: string) {
  const { resolved, serveUrl, dir } = await prepare(name, { soundtrack: true });
  const { chromiumOptions, browserExecutable } = chromium();
  const inputProps = { short: resolved, drawScale: 1 };
  const composition = await selectComposition({ serveUrl, id: COMPOSITION, inputProps, chromiumOptions, browserExecutable });
  const outDir = path.join(dir, "out");
  await mkdir(outDir, { recursive: true });
  const outputLocation = path.join(outDir, `${name}.mp4`);
  const started = Date.now();
  let last = -1;
  log(`Rendering ${composition.durationInFrames} frames at ${composition.width}x${composition.height} on the CPU…`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    chromiumOptions,
    browserExecutable,
    concurrency: Number(process.env.REMOTION_CONCURRENCY) || 2,
    crf: 21,
    encodingMaxRate: resolved.quality === 1080 ? "8M" : "5M",
    encodingBufferSize: "16M",
    x264Preset: "veryfast",
    timeoutInMilliseconds: 120_000,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= last + 5) {
        last = pct;
        const elapsed = (Date.now() - started) / 1000;
        const eta = progress > 0.02 ? Math.round((elapsed / progress) * (1 - progress)) : null;
        log(`${pct}%${eta !== null ? ` (about ${eta}s left)` : ""}`);
      }
    },
  });
  log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s → ${path.relative(ROOT, outputLocation)}`);
  return outputLocation;
}
