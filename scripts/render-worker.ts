// Background render worker: claims queued jobs one at a time until the queue is empty.
// Started by lib/server/render-queue.ts; can also be run standalone (`npm run worker`).
import { stat } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ProjectSettings, StoryPlan } from "../lib/engine/types";
import { db, MEDIA_DIR, now } from "../lib/server/db";
import { mediaPath, mediaUrl, projectDir, toRender } from "../lib/server/projects";
import { renderVideo } from "../lib/server/render-video";

function claim() {
  const row = db()
    .prepare(
      `UPDATE renders SET status = 'rendering', progress = 0, updated_at = ?
       WHERE id = (SELECT id FROM renders WHERE status = 'queued' ORDER BY created_at LIMIT 1)
       RETURNING *`,
    )
    .get(now()) as Record<string, unknown> | undefined;
  return row ? { job: toRender(row), input: JSON.parse(row.input as string) as { plan: StoryPlan; settings: ProjectSettings } } : null;
}

async function main() {
  for (let next = claim(); next; next = claim()) {
    const { job, input } = next;
    const dir = path.join(projectDir(job.userId, job.projectId), "renders");
    mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, `${job.id}.mp4`);
    const posterFile = path.join(dir, `${job.id}.jpg`);
    const started = Date.now();
    let last = -1;
    console.log(`[render] ${job.id} started`);
    try {
      const result = await renderVideo({
        plan: input.plan,
        settings: input.settings,
        resolveMedia: (url) => mediaPath(job.userId, url),
        outFile,
        posterFile,
        onProgress: (f) => {
          const pct = Math.floor(f * 100);
          if (pct === last) return;
          last = pct;
          db().prepare("UPDATE renders SET progress = ?, updated_at = ? WHERE id = ?").run(f, now(), job.id);
        },
      });
      const size = (await stat(outFile)).size;
      db()
        .prepare("UPDATE renders SET status = 'done', progress = 1, file = ?, duration = ?, size = ?, updated_at = ? WHERE id = ?")
        .run(mediaUrl(path.relative(MEDIA_DIR, outFile)), result.duration, size, now(), job.id);
      console.log(`[render] ${job.id} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[render] ${job.id} failed:`, err);
      const msg = err instanceof Error ? err.message.split("\n")[0].slice(0, 300) : "Render failed";
      db().prepare("UPDATE renders SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(msg, now(), job.id);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
