// Project + render persistence and per-user media storage.
import { mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { clampDuration, DEFAULT_SETTINGS, type ProjectSettings, type StoryPlan } from "../engine/types";
import { db, MEDIA_DIR, newId, now } from "./db";

export interface Project {
  id: string;
  userId: string;
  title: string;
  story: string;
  duration: number;
  settings: ProjectSettings;
  plan: StoryPlan | null;
  createdAt: number;
  updatedAt: number;
}

export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface RenderJob {
  id: string;
  projectId: string;
  userId: string;
  status: RenderStatus;
  progress: number;
  error: string | null;
  file: string | null;
  duration: number | null;
  size: number | null;
  createdAt: number;
  updatedAt: number;
}

type Row = Record<string, unknown>;

function toProject(r: Row): Project {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    title: r.title as string,
    story: r.story as string,
    duration: r.duration as number,
    settings: { ...DEFAULT_SETTINGS, ...JSON.parse((r.settings as string) || "{}") },
    plan: r.plan ? (JSON.parse(r.plan as string) as StoryPlan) : null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

export function toRender(r: Row): RenderJob {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    userId: r.user_id as string,
    status: r.status as RenderStatus,
    progress: r.progress as number,
    error: (r.error as string) ?? null,
    file: (r.file as string) ?? null,
    duration: (r.duration as number) ?? null,
    size: (r.size as number) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

export function listProjects(userId: string): Project[] {
  return (db().prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as Row[]).map(toProject);
}

export function getProject(userId: string, id: string): Project | null {
  const r = db().prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
  return r ? toProject(r) : null;
}

export function createProject(userId: string, input: { title?: string; story?: string; duration?: number } = {}): Project {
  const id = newId("p_");
  const t = now();
  db()
    .prepare("INSERT INTO projects (id, user_id, title, story, duration, settings, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)")
    .run(id, userId, (input.title || "Untitled story").slice(0, 80), (input.story || "").slice(0, 6000), clampDuration(input.duration ?? 30), JSON.stringify(DEFAULT_SETTINGS), t, t);
  return getProject(userId, id)!;
}

export interface ProjectPatch {
  title?: string;
  story?: string;
  duration?: number;
  settings?: Partial<ProjectSettings>;
  plan?: StoryPlan | null;
}

export function updateProject(userId: string, id: string, patch: ProjectPatch): Project | null {
  const p = getProject(userId, id);
  if (!p) return null;
  const next = {
    title: patch.title !== undefined ? String(patch.title).slice(0, 80) || "Untitled story" : p.title,
    story: patch.story !== undefined ? String(patch.story).slice(0, 6000) : p.story,
    duration: patch.duration !== undefined ? clampDuration(Number(patch.duration) || 30) : p.duration,
    settings: patch.settings ? { ...p.settings, ...patch.settings } : p.settings,
    plan: patch.plan !== undefined ? patch.plan : p.plan,
  };
  db()
    .prepare("UPDATE projects SET title = ?, story = ?, duration = ?, settings = ?, plan = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(next.title, next.story, next.duration, JSON.stringify(next.settings), next.plan ? JSON.stringify(next.plan) : null, now(), id, userId);
  return getProject(userId, id);
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const res = db().prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, userId);
  if (!res.changes) return false;
  await rm(projectDir(userId, id), { recursive: true, force: true });
  return true;
}

export function listRenders(userId: string, projectId?: string): RenderJob[] {
  const rows = projectId
    ? db().prepare("SELECT * FROM renders WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 20").all(userId, projectId)
    : db().prepare("SELECT * FROM renders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(userId);
  return (rows as Row[]).map(toRender);
}

export function getRender(userId: string, id: string): RenderJob | null {
  const r = db().prepare("SELECT * FROM renders WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
  return r ? toRender(r) : null;
}

export function userStats(userId: string) {
  const projects = (db().prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?").get(userId) as { n: number }).n;
  const r = db()
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(duration), 0) AS secs FROM renders WHERE user_id = ? AND status = 'done'")
    .get(userId) as { n: number; secs: number };
  const active = (db().prepare("SELECT COUNT(*) AS n FROM renders WHERE user_id = ? AND status IN ('queued','rendering')").get(userId) as { n: number }).n;
  return { projects, renders: r.n, seconds: r.secs, active };
}

// ---------- media ----------

export function projectDir(userId: string, projectId: string) {
  return path.join(MEDIA_DIR, userId, projectId);
}

/** Saves a file under the project's media folder and returns its public URL. */
export async function saveMedia(userId: string, projectId: string, name: string, data: Buffer | Uint8Array): Promise<string> {
  const dir = projectDir(userId, projectId);
  mkdirSync(dir, { recursive: true });
  await writeFile(path.join(dir, name), data);
  return mediaUrl(path.join(userId, projectId, name));
}

export function mediaUrl(rel: string) {
  return `/api/media/${rel.split(path.sep).join("/")}`;
}

/** Resolve a /api/media URL back to a file path, only if it belongs to `userId`. */
export function mediaPath(userId: string, url: string): string | null {
  const m = /^\/api\/media\/(.+)$/.exec(url.split("?")[0]);
  if (!m) return null;
  const parts = m[1].split("/").map(decodeURIComponent);
  if (parts[0] !== userId || parts.some((p) => p === ".." || p.includes("\\") || p === "")) return null;
  const full = path.join(MEDIA_DIR, ...parts);
  return full.startsWith(MEDIA_DIR + path.sep) ? full : null;
}

export const fileId = () => newId();

/** Most recent render per project (any status). */
export function latestRenderByProject(userId: string): Map<string, RenderJob> {
  const rows = db()
    .prepare(
      `SELECT r.* FROM renders r
       JOIN (SELECT project_id, MAX(created_at) AS c FROM renders WHERE user_id = ? GROUP BY project_id) m
         ON m.project_id = r.project_id AND m.c = r.created_at
       WHERE r.user_id = ?`,
    )
    .all(userId, userId) as Row[];
  return new Map(rows.map((r) => [r.project_id as string, toRender(r)]));
}

export const posterOf = (r: RenderJob | null | undefined) => (r?.file ? r.file.replace(/\.mp4$/, ".jpg") : null);
