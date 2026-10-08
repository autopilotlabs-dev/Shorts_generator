// SQLite persistence using Node's built-in `node:sqlite` (no native deps to install).
// Shared by the Next.js server and the render worker process.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as DB } from "node:sqlite";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const MEDIA_DIR = path.join(DATA_DIR, "media");

// Loaded via getBuiltinModule so bundlers never try to resolve it. Node 22 flags
// node:sqlite as experimental; silence that one warning while loading it.
const { DatabaseSync } = (() => {
  const emit = process.emitWarning;
  process.emitWarning = ((w: string | Error, ...rest: unknown[]) =>
    String(w).includes("SQLite") ? undefined : (emit as (...a: unknown[]) => void).call(process, w, ...rest)) as typeof process.emitWarning;
  try {
    return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  } finally {
    process.emitWarning = emit;
  }
})();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  story TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 30,
  settings TEXT NOT NULL DEFAULT '{}',
  plan TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,            -- queued | rendering | done | failed
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  file TEXT,                       -- /api/media URL of the MP4 (poster: same name, .jpg)
  duration REAL,
  size INTEGER,
  input TEXT NOT NULL,             -- JSON snapshot: plan + settings at request time
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS renders_project ON renders(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS renders_status ON renders(status);
`;

declare global {
  // eslint-disable-next-line no-var
  var __nightshadeDb: DB | undefined;
}

export function db(): DB {
  if (!globalThis.__nightshadeDb) {
    mkdirSync(MEDIA_DIR, { recursive: true });
    const d = new DatabaseSync(path.join(DATA_DIR, "app.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    globalThis.__nightshadeDb = d;
  }
  return globalThis.__nightshadeDb;
}

export const now = () => Date.now();

export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}
