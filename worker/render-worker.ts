// Render worker: consumes BullMQ jobs and renders videos with Remotion.
// Run with `npm run worker` (Docker Compose runs it as its own service).
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";
import { db } from "../db";
import { renders } from "../db/app-schema";
import { buildSoundtrack } from "../lib/server/audio-decode";
import { RENDER_QUEUE, type RenderJobData } from "../lib/server/render-queue";
import { redisUrl } from "../lib/server/redis";
import { newFileId, projectPrefix, storage } from "../lib/server/storage";
import { COMPOSITION_ID } from "../remotion/Root";
import type { HorrorShortProps } from "../remotion/HorrorShort";

const root = process.cwd();
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const concurrency = process.env.REMOTION_CONCURRENCY ? Number(process.env.REMOTION_CONCURRENCY) : null;
/** Signed media URLs must outlive the longest render. */
const URL_TTL = 2 * 60 * 60;

let serveUrlPromise: Promise<string> | null = null;
function serveUrl() {
  // A prebuilt or hosted bundle (e.g. for Remotion Lambda) can be supplied instead of bundling here.
  serveUrlPromise ??= process.env.REMOTION_SERVE_URL
    ? Promise.resolve(process.env.REMOTION_SERVE_URL)
    : bundle({ entryPoint: path.join(root, "remotion", "index.ts"), publicDir: path.join(root, "public") });
  return serveUrlPromise;
}

async function setStatus(id: string, patch: Partial<typeof renders.$inferInsert>) {
  await db.update(renders).set({ ...patch, updatedAt: new Date() }).where(eq(renders.id, id));
}

async function processJob(job: Job<RenderJobData>) {
  const id = job.data.renderId;
  const [row] = await db.select().from(renders).where(eq(renders.id, id));
  if (!row) return; // project was deleted
  const { plan, settings } = row.input;
  const store = storage();
  const prefix = `${projectPrefix(row.userId, row.projectId)}/renders`;
  const tmp = await mkdtemp(path.join(tmpdir(), "nightshade-"));
  const audioKey = `${prefix}/${id}-${newFileId()}.wav`;

  try {
    await setStatus(id, { status: "rendering", progress: 0.01, error: null });
    const own = (key: string) => key.startsWith(`${row.userId}/`);

    // 1. Soundtrack: score + SFX + narration mixed offline, uploaded so the browser renderer can fetch it.
    const wav = await buildSoundtrack(plan, settings, (key) => {
      if (!own(key)) throw new Error("Foreign media key");
      return store.read(key);
    });
    await store.put(audioKey, wav, "audio/wav");
    await setStatus(id, { progress: 0.05 });

    // 2. Signed URLs for every asset the composition loads.
    const media: Record<string, string> = {};
    for (const s of plan.scenes) if (s.imageKey && own(s.imageKey)) media[s.imageKey] = await store.signedUrl(s.imageKey, URL_TTL);
    const inputProps: HorrorShortProps = {
      plan,
      settings: { captionStyle: settings.captionStyle, showTitle: settings.showTitle, quality: settings.quality },
      soundtrackUrl: await store.signedUrl(audioKey, URL_TTL),
      media,
    };

    // 3. Render with Remotion.
    const url = await serveUrl();
    const composition = await selectComposition({ serveUrl: url, id: COMPOSITION_ID, inputProps, browserExecutable });
    const out = path.join(tmp, "video.mp4");
    let last = 0;
    await renderMedia({
      composition,
      serveUrl: url,
      codec: "h264",
      outputLocation: out,
      inputProps,
      browserExecutable,
      concurrency,
      chromiumOptions: { enableMultiProcessOnLinux: true },
      crf: 21,
      // Film grain is expensive to encode; cap near the bitrate Shorts/Reels/TikTok recommend.
      encodingMaxRate: settings.quality === 720 ? "5M" : "8M",
      encodingBufferSize: "16M",
      x264Preset: "veryfast",
      onProgress: ({ progress }) => {
        const p = 0.05 + progress * 0.9;
        if (p - last >= 0.02) {
          last = p;
          void job.updateProgress(Math.round(p * 100));
          void setStatus(id, { progress: p });
        }
      },
    });
    const poster = path.join(tmp, "poster.jpg");
    await renderStill({
      composition,
      serveUrl: url,
      output: poster,
      inputProps,
      browserExecutable,
      frame: Math.min(Math.round(1.4 * composition.fps), composition.durationInFrames - 1),
      imageFormat: "jpeg",
      jpegQuality: 82,
    });

    // 4. Store results.
    const video = await readFile(out);
    const videoKey = `${prefix}/${id}.mp4`;
    const posterKey = `${prefix}/${id}.jpg`;
    await store.put(videoKey, video, "video/mp4");
    await store.put(posterKey, await readFile(poster), "image/jpeg");
    await setStatus(id, {
      status: "done",
      progress: 1,
      videoKey,
      posterKey,
      size: video.length,
      duration: composition.durationInFrames / composition.fps,
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await store.delete(audioKey).catch(() => {});
  }
}

const worker = new Worker<RenderJobData>(RENDER_QUEUE, processJob, {
  connection: new IORedis(redisUrl(), { maxRetriesPerRequest: null }),
  concurrency: Number(process.env.RENDER_JOBS) || 1,
  lockDuration: 5 * 60_000,
});

worker.on("ready", () => console.log("[worker] ready, waiting for render jobs"));
worker.on("active", (job) => console.log(`[worker] ${job.data.renderId} started`));
worker.on("completed", (job) => console.log(`[worker] ${job.data.renderId} done in ${((Date.now() - job.processedOn!) / 1000).toFixed(1)}s`));
worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[worker] ${job.data.renderId} failed (attempt ${job.attemptsMade}):`, err);
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  await setStatus(job.data.renderId, final ? { status: "failed", error: err.message.split("\n")[0].slice(0, 300) } : { status: "queued", progress: 0 });
});

// Warm the bundle so the first job doesn't wait for webpack.
serveUrl().then(
  () => console.log("[worker] Remotion bundle ready"),
  (err) => console.error("[worker] bundling failed", err),
);

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
