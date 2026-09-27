import Redis from "ioredis";
import { config } from "./config";

type FailStrategy = "open" | "closed";

export interface RedisClient {
  client: Redis;
  isHealthy: () => boolean;
  failStrategy: FailStrategy;
  shutdown: () => Promise<void>;
}

let instance: RedisClient | null = null;

export function createRedisClient(overrideUrl?: string): RedisClient {
  const url = overrideUrl ?? config.REDIS_URL;
  const failStrategy = config.REDIS_FAIL_STRATEGY;

  const client = new Redis(url, {
    // Don't crash the process on connection errors — we handle degradation ourselves
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: (times) => {
      // Exponential backoff capped at 10s, max 20 retries
      if (times > 20) return null; // stop retrying
      return Math.min(times * 200, 10_000);
    },
  });

  let healthy = false;

  client.on("connect", () => {
    healthy = true;
    console.log("[redis] connected");
  });

  client.on("ready", () => {
    healthy = true;
    console.log("[redis] ready");
  });

  client.on("error", (err: Error) => {
    healthy = false;
    // Log at warn level — this is expected during degraded operation
    console.warn(`[redis] error: ${err.message}`);
  });

  client.on("close", () => {
    healthy = false;
    console.warn("[redis] connection closed");
  });

  client.on("reconnecting", () => {
    console.log("[redis] reconnecting…");
  });

  // Kick off the connection (non-blocking)
  client.connect().catch(() => {
    // Swallow — the error handler above fires too
  });

  const redisClient: RedisClient = {
    client,
    isHealthy: () => healthy,
    failStrategy,
    shutdown: async () => {
      await client.quit();
    },
  };

  return redisClient;
}

export function getRedisClient(): RedisClient {
  if (!instance) {
    instance = createRedisClient();
  }
  return instance;
}

export function resetRedisClient(): void {
  instance = null;
}
