// Project + render persistence (Drizzle / Postgres). Every query is scoped to the owner.
import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { projects, renders, type ProjectRow, type RenderRow } from "@/db/app-schema";
import { clampDuration, DEFAULT_SETTINGS, type ProjectSettings, type StoryPlan } from "../engine/types";
import { projectPrefix, storage } from "./storage";

export interface Project {
  id: string;
  title: string;
  story: string;
  duration: number;
  settings: ProjectSettings;
  plan: StoryPlan | null;
  createdAt: number;
  updatedAt: number;
}

export type RenderStatus = RenderRow["status"];

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderStatus;
  progress: number;
  error: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  duration: number | null;
  size: number | null;
  createdAt: number;
}

/** Browser-facing URL for a stored object (session-checked by /api/media). */
export const mediaUrl = (key: string) => `/api/media/${key}`;

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  title: r.title,
  story: r.story,
  duration: r.duration,
  settings: { ...DEFAULT_SETTINGS, ...r.settings },
  plan: r.plan ?? null,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
});

export const toRender = (r: RenderRow): RenderJob => ({
  id: r.id,
  projectId: r.projectId,
  status: r.status,
  progress: r.progress,
  error: r.error,
  videoUrl: r.videoKey ? mediaUrl(r.videoKey) : null,
  posterUrl: r.posterKey ? mediaUrl(r.posterKey) : null,
  duration: r.duration,
  size: r.size,
  createdAt: r.createdAt.getTime(),
});

export const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);

export async function listProjects(userId: string): Promise<Project[]> {
  const rows = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
  return rows.map(toProject);
}

export async function getProject(userId: string, id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return row ? toProject(row) : null;
}

export async function createProject(userId: string, input: { title?: string; story?: string; duration?: number } = {}): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      id: newId("p_"),
      userId,
      title: (input.title || "Untitled story").slice(0, 80),
      story: (input.story || "").slice(0, 6000),
      duration: clampDuration(input.duration ?? 30),
      settings: DEFAULT_SETTINGS,
    })
    .returning();
  return toProject(row);
}

export interface ProjectPatch {
  title?: string;
  story?: string;
  duration?: number;
  settings?: Partial<ProjectSettings>;
  plan?: StoryPlan | null;
}

export async function updateProject(userId: string, id: string, patch: ProjectPatch): Promise<Project | null> {
  const current = await getProject(userId, id);
  if (!current) return null;
  const [row] = await db
    .update(projects)
    .set({
      ...(patch.title !== undefined && { title: String(patch.title).slice(0, 80) || "Untitled story" }),
      ...(patch.story !== undefined && { story: String(patch.story).slice(0, 6000) }),
      ...(patch.duration !== undefined && { duration: clampDuration(Number(patch.duration) || 30) }),
      ...(patch.settings && { settings: { ...current.settings, ...patch.settings } }),
      ...(patch.plan !== undefined && { plan: patch.plan }),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return row ? toProject(row) : null;
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const res = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning({ id: projects.id });
  if (!res.length) return false;
  await storage().deletePrefix(projectPrefix(userId, id));
  return true;
}

export async function listRenders(userId: string, projectId?: string, limit = 20): Promise<RenderJob[]> {
  const where = projectId ? and(eq(renders.userId, userId), eq(renders.projectId, projectId)) : eq(renders.userId, userId);
  const rows = await db.select().from(renders).where(where).orderBy(desc(renders.createdAt)).limit(limit);
  return rows.map(toRender);
}

export async function getRender(userId: string, id: string): Promise<RenderJob | null> {
  const [row] = await db.select().from(renders).where(and(eq(renders.id, id), eq(renders.userId, userId)));
  return row ? toRender(row) : null;
}

/** Most recent render per project. */
export async function latestRenderByProject(userId: string): Promise<Map<string, RenderJob>> {
  const rows = await db
    .selectDistinctOn([renders.projectId])
    .from(renders)
    .where(eq(renders.userId, userId))
    .orderBy(renders.projectId, desc(renders.createdAt));
  return new Map(rows.map((r) => [r.projectId, toRender(r)]));
}

export async function userStats(userId: string) {
  const [[p], [r], [a]] = await Promise.all([
    db.select({ n: count() }).from(projects).where(eq(projects.userId, userId)),
    db
      .select({ n: count(), secs: sum(renders.duration) })
      .from(renders)
      .where(and(eq(renders.userId, userId), eq(renders.status, "done"))),
    db
      .select({ n: count() })
      .from(renders)
      .where(and(eq(renders.userId, userId), inArray(renders.status, ["queued", "rendering"]))),
  ]);
  return { projects: p.n, renders: r.n, seconds: Number(r.secs ?? 0), active: a.n };
}

export async function activeRenderCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(renders)
    .where(and(eq(renders.userId, userId), inArray(renders.status, ["queued", "rendering"])));
  return r.n;
}
