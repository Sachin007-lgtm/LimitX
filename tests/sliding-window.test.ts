import RedisMock from "ioredis-mock";
import { slidingWindowCheck } from "../src/limiters/sliding-window";

/**
 * Same approach as token-bucket tests: override eval with a JS simulation
 * of the Lua sliding-window script so we can unit test without a real Redis.
 */
class RedisMockWithSlidingWindow extends RedisMock {
  // sorted set: key → array of [score, member]
  private sets: Map<string, Array<[number, string]>> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async eval(_script: string, _numkeys: number, ...args: any[]): Promise<any> {
    const key = args[0] as string;
    const limit = parseInt(args[1]);
    const windowMs = parseInt(args[2]);
    const nowMs = parseInt(args[3]);
    const requestId = args[4] as string;

    if (!this.sets.has(key)) this.sets.set(key, []);
    const set = this.sets.get(key)!;

    const cutoff = nowMs - windowMs;

    // Prune expired entries
    const pruned = set.filter(([score]) => score > cutoff);
    this.sets.set(key, pruned);

    if (pruned.length < limit) {
      pruned.push([nowMs, requestId]);
      pruned.sort((a, b) => a[0] - b[0]);
      const remaining = limit - pruned.length;
      return [1, remaining, nowMs + windowMs];
    } else {
      const oldest = pruned[0];
      const resetMs = oldest ? oldest[0] + windowMs : nowMs + windowMs;
      return [0, 0, resetMs];
    }
  }

  flushall(): Promise<"OK"> {
    this.sets.clear();
    return Promise.resolve("OK");
  }
}

const redis = new RedisMockWithSlidingWindow() as unknown as import("ioredis").default;

beforeEach(async () => {
  await redis.flushall();
});

describe("slidingWindowCheck", () => {
  const limit = 5;
  const windowMs = 60_000;
  const clientId = "test-sw-client";

  it("allows requests up to the limit", async () => {
    for (let i = 0; i < limit; i++) {
      const res = await slidingWindowCheck(redis, clientId, limit, windowMs);
      expect(res.allowed).toBe(true);
      expect(res.algorithm).toBe("sliding-window");
    }
  });

  it("blocks on the (limit+1)th request", async () => {
    for (let i = 0; i < limit; i++) {
      await slidingWindowCheck(redis, clientId, limit, windowMs);
    }
    const res = await slidingWindowCheck(redis, clientId, limit, windowMs);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("decrements remaining correctly", async () => {
    const r1 = await slidingWindowCheck(redis, clientId, limit, windowMs);
    expect(r1.remaining).toBe(limit - 1);

    const r2 = await slidingWindowCheck(redis, clientId, limit, windowMs);
    expect(r2.remaining).toBe(limit - 2);
  });

  it("independent windows per client", async () => {
    for (let i = 0; i < limit; i++) {
      await slidingWindowCheck(redis, "sw-a", limit, windowMs);
    }
    const blocked = await slidingWindowCheck(redis, "sw-a", limit, windowMs);
    expect(blocked.allowed).toBe(false);

    const unaffected = await slidingWindowCheck(redis, "sw-b", limit, windowMs);
    expect(unaffected.allowed).toBe(true);
  });

  it("resetAt points to when the oldest entry expires", async () => {
    // Fill the window
    for (let i = 0; i < limit; i++) {
      await slidingWindowCheck(redis, clientId, limit, windowMs);
    }
    const denied = await slidingWindowCheck(redis, clientId, limit, windowMs);
    expect(denied.resetAt).toBeGreaterThan(Date.now());
    // Should be approximately now + windowMs (all entries were just added)
    expect(denied.resetAt).toBeLessThanOrEqual(Date.now() + windowMs + 100);
  });
});
