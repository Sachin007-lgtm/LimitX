import type { FastifyPluginAsync } from "fastify";
import { rateLimitConfig } from "../limits.config";
import { getRedisClient } from "../redis";
import { config } from "../config";

const demoRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/demo/config
   * Returns current rate limit rules and tiers for the frontend UI.
   */
  fastify.get("/api/demo/config", async (_req, reply) => {
    reply.send({
      default: rateLimitConfig.default,
      tiers: rateLimitConfig.tiers,
      routes: rateLimitConfig.routes,
      instanceId: process.env.INSTANCE_ID ?? "gateway-primary",
      failStrategy: config.REDIS_FAIL_STRATEGY,
    });
  });

  /**
   * POST /api/demo/reset
   * Clears rate limit state in Redis for a specific client key.
   */
  fastify.post("/api/demo/reset", async (req, reply) => {
    const body = (req.body as { clientId?: string; key?: string }) || {};
    const rawKey = body.key || body.clientId || (req.headers["x-api-key"] as string) || "demo-client";
    const redis = getRedisClient();

    if (!redis.isHealthy()) {
      return reply.status(503).send({ success: false, error: "Redis is unavailable" });
    }

    try {
      const redisClient = redis.client;
      // Search and delete keys matching token-bucket, sliding-window, and fixed-window
      const patterns = [
        `rate:tb:key:${rawKey}`,
        `rate:tb:ip:${rawKey}`,
        `rate:tb:${rawKey}`,
        `rate:sw:key:${rawKey}`,
        `rate:sw:ip:${rawKey}`,
        `rate:sw:${rawKey}`,
        `rate:fw:key:${rawKey}:*`,
        `rate:fw:ip:${rawKey}:*`,
        `rate:fw:${rawKey}:*`,
      ];

      let deletedCount = 0;
      for (const pattern of patterns) {
        if (pattern.includes("*")) {
          const keys = await redisClient.keys(pattern);
          if (keys.length > 0) {
            await redisClient.del(...keys);
            deletedCount += keys.length;
          }
        } else {
          const res = await redisClient.del(pattern);
          deletedCount += res;
        }
      }

      return reply.send({
        success: true,
        message: `Reset rate limits for client [${rawKey}]`,
        deletedKeys: deletedCount,
        resetTimestamp: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  /**
   * GET /api/demo/node-info
   * Returns instance telemetry (instance ID, memory, uptime, etc.)
   */
  fastify.get("/api/demo/node-info", async (_req, reply) => {
    const mem = process.memoryUsage();
    reply.send({
      instanceId: process.env.INSTANCE_ID ?? "gateway-primary",
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      timestamp: new Date().toISOString(),
    });
  });
};

export default demoRoutes;
