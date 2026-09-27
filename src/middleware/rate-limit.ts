import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { checkRateLimit } from "../limiters";
import { resolveRule } from "../limits.config";
import { getRedisClient } from "../redis";
import type { RequestContext } from "../types";

/**
 * Extract a stable client identifier from the request.
 *
 * Priority: X-API-Key header > X-Forwarded-For (first IP) > socket remote address.
 * In production you'd always require an API key; the IP fallback is here for
 * easy local testing without needing to set headers.
 */
function extractClientId(req: FastifyRequest): string {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) return `key:${apiKey}`;

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return `ip:${firstIp}`;
  }

  return `ip:${req.socket.remoteAddress ?? "unknown"}`;
}

function extractTier(req: FastifyRequest): string | undefined {
  const tier = req.headers["x-client-tier"];
  return typeof tier === "string" ? tier : undefined;
}

/**
 * Add standard rate-limit response headers.
 * These mirror the draft IETF RateLimit headers spec.
 */
function setRateLimitHeaders(
  reply: FastifyReply,
  remaining: number,
  limit: number,
  resetAt: number,
  degraded?: boolean,
): void {
  reply.header("RateLimit-Limit", limit);
  reply.header("RateLimit-Remaining", remaining);
  reply.header("RateLimit-Reset", Math.ceil(resetAt / 1000)); // Unix seconds
  reply.header("X-RateLimit-Algorithm", "");  // filled by route handler
  if (degraded) {
    reply.header("X-RateLimit-Degraded", "true");
  }
}

// Attach rate limit result to the request for downstream plugins/routes
declare module "fastify" {
  interface FastifyRequest {
    rateLimitResult?: import("../types").RateLimitResult;
    requestContext?: RequestContext;
  }
}

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip health check endpoint
    if (req.url === "/health" || req.url === "/health/") return;

    const clientId = extractClientId(req);
    const tier = extractTier(req);
    const method = req.method;
    // Normalise path: strip query string
    const path = req.url.split("?")[0];

    const context: RequestContext = { clientId, tier, method, path };
    req.requestContext = context;

    const rule = resolveRule(method, path, tier);
    const redis = getRedisClient();

    const result = await checkRateLimit(redis, context, rule);
    req.rateLimitResult = result;

    // Always set headers on the way out
    reply.header("X-RateLimit-Algorithm", result.algorithm);
    setRateLimitHeaders(reply, result.remaining, result.limit, result.resetAt, result.degraded);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
      reply.header("Retry-After", retryAfterSec);
      reply
        .status(429)
        .send({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
          limit: result.limit,
          resetAt: new Date(result.resetAt).toISOString(),
        });
    }
  });
};

// fastify-plugin unwraps the plugin so it shares the parent scope (no encapsulation)
export default fp(rateLimitPlugin, { name: "rate-limit" });
