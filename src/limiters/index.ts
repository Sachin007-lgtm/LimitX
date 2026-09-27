import type { RedisClient } from "../redis";
import type { RateLimitResult, RateLimitRule, RequestContext } from "../types";
import { fixedWindowCheck } from "./fixed-window";
import { tokenBucketCheck } from "./token-bucket";
import { slidingWindowCheck } from "./sliding-window";

/**
 * Dispatch a rate limit check to the correct algorithm implementation.
 *
 * If Redis is unhealthy, we apply the configured fail strategy:
 *   - "open"  → allow the request, mark result as degraded
 *   - "closed" → deny the request, mark result as degraded
 */
export async function checkRateLimit(
  redisClient: RedisClient,
  context: RequestContext,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  // Build a key that combines client identity + route so different routes get
  // independent buckets even for the same client.
  const clientId = `${context.clientId}:${context.method}:${context.path}`;

  if (!redisClient.isHealthy()) {
    return degradedResult(rule, redisClient.failStrategy === "open");
  }

  try {
    const algorithm = rule.algorithm ?? "token-bucket";

    switch (algorithm) {
      case "fixed-window":
        return await fixedWindowCheck(
          redisClient.client,
          clientId,
          rule.limit,
          rule.windowMs,
        );

      case "token-bucket":
        return await tokenBucketCheck(
          redisClient.client,
          clientId,
          rule.limit,
          rule.windowMs,
          rule.refillRate,
        );

      case "sliding-window":
        return await slidingWindowCheck(
          redisClient.client,
          clientId,
          rule.limit,
          rule.windowMs,
        );

      default: {
        const _exhaustive: never = algorithm;
        throw new Error(`Unknown algorithm: ${_exhaustive}`);
      }
    }
  } catch (err) {
    // Redis went away mid-request — apply fail strategy
    const isHealthyNow = redisClient.isHealthy();
    if (!isHealthyNow) {
      console.warn("[rate-limiter] Redis error during check, applying fail strategy:", err);
      return degradedResult(rule, redisClient.failStrategy === "open");
    }
    // Some other unexpected error — rethrow so the request handler can 500
    throw err;
  }
}

function degradedResult(rule: RateLimitRule, allow: boolean): RateLimitResult {
  return {
    allowed: allow,
    remaining: allow ? rule.limit : 0,
    limit: rule.limit,
    resetAt: Date.now() + rule.windowMs,
    algorithm: rule.algorithm ?? "token-bucket",
    degraded: true,
  };
}
