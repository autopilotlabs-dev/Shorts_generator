// Render requests go to a BullMQ queue in Redis; a separate worker process (worker/render-worker.ts)
// renders them with Remotion. The `renders` table is the source of truth the UI polls.
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { db } from "@/db";
import { renders } from "@/db/app-schema";
import { MAX_DURATION, MIN_DURATION, totalDuration } from "../engine/types";
import { HttpError } from "./http";
import { activeRenderCount, newId, toRender, type Project, type RenderJob } from "./projects";
import { redisUrl } from "./redis";

export const RENDER_QUEUE = "render";
export interface RenderJobData {
  renderId: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __renderQueue: Queue<RenderJobData> | undefined;
}

export function renderQueue(): Queue<RenderJobData> {
  globalThis.__renderQueue ??= new Queue<RenderJobData>(RENDER_QUEUE, {
    connection: new IORedis(redisUrl(), { maxRetriesPerRequest: null }),
  });
  return globalThis.__renderQueue;
}

export async function enqueueRender(userId: string, project: Project): Promise<RenderJob> {
  const plan = project.plan;
  if (!plan?.scenes.length) throw new HttpError(400, "Generate scenes before rendering.");
  const total = totalDuration(plan);
  if (total < MIN_DURATION - 0.05 || total > MAX_DURATION + 0.05) {
    throw new HttpError(400, `Video must be ${MIN_DURATION}-${MAX_DURATION}s long (currently ${total.toFixed(1)}s).`);
  }
  if ((await activeRenderCount(userId)) >= 2) throw new HttpError(429, "You already have renders in progress. Wait for them to finish.");

  const [row] = await db
    .insert(renders)
    .values({ id: newId("r_"), projectId: project.id, userId, input: { plan, settings: project.settings, title: project.title } })
    .returning();
  await renderQueue().add(
    "render",
    { renderId: row.id },
    { jobId: row.id, attempts: 2, backoff: { type: "exponential", delay: 15_000 }, removeOnComplete: 500, removeOnFail: 500 },
  );
  return toRender(row);
}
