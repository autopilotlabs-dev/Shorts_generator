// Postgres via postgres.js + Drizzle ORM. Shared by the web app and the render worker.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

// Reuse one pool across Next.js dev hot reloads.
const client = (globalThis.__pg ??= postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE) || 10 }));

export const db = drizzle(client, { schema });
export { schema };
