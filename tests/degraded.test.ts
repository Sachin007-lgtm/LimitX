import { checkRateLimit } from "../src/limiters";
import type { RedisClient } from "../src/redis";
import type { RequestContext, RateLimitRule } from "../src/types";

/**
 * Tests for graceful degradation when Redis is unavailable.
 */

const rule: RateLimitRule = {
  limit: 100,
  windowMs: 60_000,
  algorithm: "token-bucket",
};

const context: RequestContext = {
  clientId: "degraded-test-client",
  method: "GET",
  path: "/api/test",
};

function makeUnhealthyRedis(strategy: "open" | "closed"): RedisClient {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: {} as any,
    isHealthy: () => false,
    failStrategy: strategy,
    shutdown: async () => {},
  };
}

describe("checkRateLimit degradation", () => {
  it("allows all requests when fail-open and Redis is down", async () => {
    const redis = makeUnhealthyRedis("open");
    const result = await checkRateLimit(redis, context, rule);

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.limit).toBe(rule.limit);
  });

  it("blocks all requests when fail-closed and Redis is down", async () => {
    const redis = makeUnhealthyRedis("closed");
    const result = await checkRateLimit(redis, context, rule);

    expect(result.allowed).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("degraded result preserves the algorithm label", async () => {
    const redis = makeUnhealthyRedis("open");
    const result = await checkRateLimit(redis, context, rule);
    expect(result.algorithm).toBe("token-bucket");
  });

  it("degraded result has a future resetAt", async () => {
    const redis = makeUnhealthyRedis("open");
    const before = Date.now();
    const result = await checkRateLimit(redis, context, rule);
    expect(result.resetAt).toBeGreaterThan(before);
  });
});
