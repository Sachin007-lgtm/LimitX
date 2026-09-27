import type Redis from "ioredis";
import type { RateLimitResult } from "../types";

/**
 * Fixed-window counter using Redis INCR + EXPIRE.
 *
 * Key: rate:fw:{clientId}:{windowIndex}
 *
 * Known limitation (by design — we use this as the "before" story):
 * A client can make `limit` requests in the last second of window N and
 * another `limit` requests in the first second of window N+1 — effectively
 * 2× the limit in a 2-second span. That's the boundary burst bug, fixed by
 * the sliding-window and token-bucket implementations.
 */
export async function fixedWindowCheck(
  redis: Redis,
  clientId: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowIndex = Math.floor(Date.now() / windowMs);
  const key = `rate:fw:${clientId}:${windowIndex}`;
  const windowSeconds = Math.ceil(windowMs / 1000);

  // INCR is atomic — no race condition on the increment itself.
  // The only gap: if two requests race on a brand-new key, both call INCR
  // before either sets EXPIRE — but both INCRs still count correctly, so
  // the worst case is the key lives an extra windowSeconds without TTL.
  // We guard that with the pipeline below.
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.pttl(key);
  const results = await pipeline.exec();

  if (!results) throw new Error("Redis pipeline returned null");

  const [incrResult, pttlResult] = results;

  if (incrResult[0]) throw incrResult[0]; // propagate Redis error
  if (pttlResult[0]) throw pttlResult[0];

  const count = incrResult[1] as number;
  const pttl = pttlResult[1] as number;

  // Set expiry only when the key is brand new (no TTL yet)
  if (pttl === -1) {
    await redis.expire(key, windowSeconds);
  }

  const resetAt = (windowIndex + 1) * windowMs;
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  return {
    allowed,
    remaining,
    limit,
    resetAt,
    algorithm: "fixed-window",
  };
}
