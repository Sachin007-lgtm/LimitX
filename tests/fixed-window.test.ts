import RedisMock from "ioredis-mock";
import { fixedWindowCheck } from "../src/limiters/fixed-window";

// ioredis-mock is wired in via jest moduleNameMapper
const redis = new RedisMock() as unknown as import("ioredis").default;

beforeEach(async () => {
  await redis.flushall();
});

describe("fixedWindowCheck", () => {
  const limit = 5;
  const windowMs = 60_000;
  const clientId = "test-client-fw";

  it("allows requests up to the limit", async () => {
    for (let i = 1; i <= limit; i++) {
      const result = await fixedWindowCheck(redis, clientId, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.algorithm).toBe("fixed-window");
    }
  });

  it("blocks requests over the limit", async () => {
    for (let i = 0; i < limit; i++) {
      await fixedWindowCheck(redis, clientId, limit, windowMs);
    }
    const result = await fixedWindowCheck(redis, clientId, limit, windowMs);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("decrements remaining correctly", async () => {
    const r1 = await fixedWindowCheck(redis, clientId, limit, windowMs);
    expect(r1.remaining).toBe(limit - 1);

    const r2 = await fixedWindowCheck(redis, clientId, limit, windowMs);
    expect(r2.remaining).toBe(limit - 2);
  });

  it("different clients have independent windows", async () => {
    // Exhaust client A
    for (let i = 0; i < limit; i++) {
      await fixedWindowCheck(redis, "client-a", limit, windowMs);
    }
    const blocked = await fixedWindowCheck(redis, "client-a", limit, windowMs);
    expect(blocked.allowed).toBe(false);

    // Client B should be unaffected
    const allowed = await fixedWindowCheck(redis, "client-b", limit, windowMs);
    expect(allowed.allowed).toBe(true);
  });

  it("returns correct limit in result", async () => {
    const result = await fixedWindowCheck(redis, clientId, limit, windowMs);
    expect(result.limit).toBe(limit);
  });

  it("resetAt is in the future", async () => {
    const before = Date.now();
    const result = await fixedWindowCheck(redis, clientId, limit, windowMs);
    expect(result.resetAt).toBeGreaterThan(before);
  });
});
