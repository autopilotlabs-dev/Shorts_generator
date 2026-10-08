// One shared ioredis connection for rate limiting. BullMQ manages its own connections.
import IORedis from "ioredis";

export const redisUrl = () => process.env.REDIS_URL || "redis://localhost:6379";

declare global {
  // eslint-disable-next-line no-var
  var __redis: IORedis | undefined;
}

export function redis(): IORedis {
  globalThis.__redis ??= new IORedis(redisUrl(), { maxRetriesPerRequest: 2, enableOfflineQueue: true });
  return globalThis.__redis;
}
