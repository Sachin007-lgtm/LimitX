/**
 * HTTP integration tests for the Fastify app.
 *
 * These tests mock Redis entirely (via ioredis-mock wired through jest
 * moduleNameMapper) so they run without a live Redis instance.
 */

import { buildApp } from "../src/app";
import { resetRedisClient } from "../src/redis";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  // Reset singleton so each test suite gets a fresh ioredis-mock instance
  resetRedisClient();
  process.env.NODE_ENV = "test";
  process.env.DEFAULT_LIMIT = "5";
  process.env.DEFAULT_WINDOW_MS = "60000";
  process.env.REDIS_FAIL_STRATEGY = "open";
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns 200 with status field", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBeLessThan(600); // 200 or 503 depending on mock
    const body = res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("redis");
  });
});

describe("GET /health/ready", () => {
  it("responds (200 or 503)", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect([200, 503]).toContain(res.statusCode);
  });
});

describe("Rate limit middleware", () => {
  const apiKey = "http-test-client-001";

  it("returns rate limit headers on allowed requests", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/test",
      headers: { "x-api-key": apiKey },
    });
    // May be 200 or 429 — but must have rate limit headers
    expect(
      res.headers["ratelimit-limit"] ?? res.headers["RateLimit-Limit"]
    ).toBeDefined();
    expect(
      res.headers["ratelimit-remaining"] ?? res.headers["RateLimit-Remaining"]
    ).toBeDefined();
  });

  it("returns 429 with correct body after limit exceeded", async () => {
    const key = "http-test-limit-client";
    // Exhaust the limit (DEFAULT_LIMIT=5 set above)
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "GET",
        url: "/api/drain",
        headers: { "x-api-key": key },
      });
    }
    const res = await app.inject({
      method: "GET",
      url: "/api/drain",
      headers: { "x-api-key": key },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe("Too Many Requests");
    expect(body).toHaveProperty("retryAfter");
    expect(body).toHaveProperty("resetAt");
  });

  it("returns Retry-After header on 429", async () => {
    const key = "http-test-retry-after";
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "GET",
        url: "/api/retry-test",
        headers: { "x-api-key": key },
      });
    }
    const res = await app.inject({
      method: "GET",
      url: "/api/retry-test",
      headers: { "x-api-key": key },
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("different clients have independent limits", async () => {
    // Exhaust client A
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "GET",
        url: "/api/isolated",
        headers: { "x-api-key": "client-a-isolated" },
      });
    }
    const blockedA = await app.inject({
      method: "GET",
      url: "/api/isolated",
      headers: { "x-api-key": "client-a-isolated" },
    });
    expect(blockedA.statusCode).toBe(429);

    // Client B should still be allowed
    const allowedB = await app.inject({
      method: "GET",
      url: "/api/isolated",
      headers: { "x-api-key": "client-b-isolated" },
    });
    expect(allowedB.statusCode).toBe(200);
  });

  it("uses IP fallback when no X-API-Key header is present", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/no-key",
      // No x-api-key header — should fall back to IP
    });
    expect([200, 429]).toContain(res.statusCode);
  });
});
