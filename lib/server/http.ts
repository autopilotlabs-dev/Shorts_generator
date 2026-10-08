import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { RenderRequestError } from "./render-queue";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Wraps a route handler: maps known errors to JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AuthError) return json({ error: err.message }, err.status);
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof RenderRequestError) return json({ error: err.message }, 400);
      console.error(err);
      return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Simple in-memory fixed-window limiter for expensive AI endpoints (per user + action). */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs = 60 * 60_000, cost = 1) {
  const t = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < t) {
    h = { n: 0, reset: t + windowMs };
    hits.set(key, h);
  }
  if (h.n + cost > max) throw new HttpError(429, "You've hit the hourly limit for this action. Try again later.");
  h.n += cost;
}
