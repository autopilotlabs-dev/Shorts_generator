// Render jobs live in the `renders` table. The web server only enqueues and
// spawns a worker process (scripts/render-worker.ts) that drains the queue, so
// CPU-heavy rendering never blocks API requests.
import { spawn } from "node:child_process";
import path from "node:path";
import { MAX_DURATION, MIN_DURATION, totalDuration } from "../engine/types";
import { db, newId, now } from "./db";
import { getRender, type Project, type RenderJob } from "./projects";

const MAX_WORKERS = Math.max(1, Number(process.env.RENDER_WORKERS) || 1);
/** A "rendering" job whose progress hasn't moved for this long is considered abandoned. */
const STALE_MS = 3 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __renderWorkers: number | undefined;
}

export class RenderRequestError extends Error {}

export function enqueueRender(userId: string, project: Project): RenderJob {
  const plan = project.plan;
  if (!plan || !plan.scenes.length) throw new RenderRequestError("Generate scenes before rendering.");
  const total = totalDuration(plan);
  if (total < MIN_DURATION - 0.05 || total > MAX_DURATION + 0.05) {
    throw new RenderRequestError(`Video must be ${MIN_DURATION}-${MAX_DURATION}s long (currently ${total.toFixed(1)}s).`);
  }
  const busy = db()
    .prepare("SELECT COUNT(*) AS n FROM renders WHERE user_id = ? AND status IN ('queued','rendering')")
    .get(userId) as { n: number };
  if (busy.n >= 2) throw new RenderRequestError("You already have renders in progress. Wait for them to finish.");

  const id = newId("r_");
  const t = now();
  db()
    .prepare(
      "INSERT INTO renders (id, project_id, user_id, status, progress, input, created_at, updated_at) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)",
    )
    .run(id, project.id, userId, JSON.stringify({ plan, settings: project.settings }), t, t);
  ensureWorkers();
  return getRender(userId, id)!;
}

/** Re-queue abandoned jobs and start workers if there is queued work. */
export function ensureWorkers() {
  const t = now();
  db()
    .prepare("UPDATE renders SET status = 'queued', progress = 0, updated_at = ? WHERE status = 'rendering' AND updated_at < ?")
    .run(t, t - STALE_MS);
  const queued = (db().prepare("SELECT COUNT(*) AS n FROM renders WHERE status = 'queued'").get() as { n: number }).n;
  globalThis.__renderWorkers ??= 0;
  while (queued > 0 && globalThis.__renderWorkers < Math.min(MAX_WORKERS, queued)) {
    globalThis.__renderWorkers++;
    const script = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "render-worker.ts");
    const child = spawn(/*turbopackIgnore: true*/ process.execPath, ["--no-warnings", "--import", "tsx", script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    const done = () => {
      globalThis.__renderWorkers = Math.max(0, (globalThis.__renderWorkers ?? 1) - 1);
    };
    child.on("exit", done);
    child.on("error", (err) => {
      console.error("Failed to start render worker:", err);
      done();
    });
  }
}
