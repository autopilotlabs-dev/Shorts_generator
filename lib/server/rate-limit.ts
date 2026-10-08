// Per-user limits on paid AI calls, shared across app instances via Redis (rate-limiter-flexible).
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { HttpError } from "./http";
import { redis } from "./redis";

const HOUR = 60 * 60;
const limiters = {
  plan: { points: 60, duration: HOUR }, // Claude scene plans
  tts: { points: 300, duration: HOUR }, // narration clips
  image: { points: 100, duration: HOUR }, // AI images
  render: { points: 30, duration: HOUR }, // video renders
} as const;

export type LimitKind = keyof typeof limiters;
const cache = new Map<LimitKind, RateLimiterRedis>();

export async function consume(kind: LimitKind, userId: string, points = 1) {
  let limiter = cache.get(kind);
  if (!limiter) {
    limiter = new RateLimiterRedis({ storeClient: redis(), keyPrefix: `rl:${kind}`, ...limiters[kind] });
    cache.set(kind, limiter);
  }
  try {
    await limiter.consume(userId, points);
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const mins = Math.ceil(err.msBeforeNext / 60_000);
      throw new HttpError(429, `Hourly limit reached for this action. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    }
    throw err;
  }
}
