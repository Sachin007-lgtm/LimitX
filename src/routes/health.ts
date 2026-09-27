import type { FastifyPluginAsync } from "fastify";
import { getRedisClient } from "../redis";
import { config } from "../config";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Returns 200 if the service is up, 503 if Redis is down.
   * Used by load balancers, Docker health checks, and k8s probes.
   */
  fastify.get("/health", async (_req, reply) => {
    const redis = getRedisClient();
    const redisUp = redis.isHealthy();

    const body = {
      status: redisUp ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: {
        connected: redisUp,
        failStrategy: config.REDIS_FAIL_STRATEGY,
      },
      version: process.env.npm_package_version ?? "unknown",
    };

    // Return 503 if Redis is down so load balancers can route away
    // (but keep serving with fail-open if configured)
    reply.status(redisUp ? 200 : 503).send(body);
  });

  /**
   * GET /health/ready
   * Strict readiness probe: 200 only when Redis is reachable.
   */
  fastify.get("/health/ready", async (_req, reply) => {
    const redis = getRedisClient();
    if (!redis.isHealthy()) {
      return reply.status(503).send({ ready: false, reason: "Redis unavailable" });
    }
    return reply.send({ ready: true });
  });
};

export default healthRoutes;
