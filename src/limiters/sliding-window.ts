import type Redis from "ioredis";
import type { RateLimitResult } from "../types";

/**
 * Sliding-window log rate limiter using a Redis sorted set.
 *
 * Each request is logged as a member of a sorted set with score = timestamp.
 * On each check we:
 *   1. Remove all entries older than `now - windowMs` (ZREMRANGEBYSCORE).
 *   2. Count remaining entries (ZCARD).
 *   3. If count < limit: add this request, allow.
 *      Else: deny (do NOT add).
 *
 * This is also implemented as a Lua script for the same atomicity reasons as
 * the token bucket — without it a burst of concurrent requests can all read
 * "count = limit - 1" before any of them write, allowing limit × concurrent
 * requests through instead of just 1.
 *
 * Space: O(limit) — the set is bounded because we prune on every call.
 */

// KEYS[1] = sorted set key
// ARGV: [1] limit  [2] windowMs  [3] nowMs  [4] requestId  [5] ttlSeconds
const SLIDING_WINDOW_SCRIPT = `
local key        = KEYS[1]
local limit      = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local now_ms     = tonumber(ARGV[3])
local request_id = ARGV[4]
local ttl_sec    = tonumber(ARGV[5])

local cutoff = now_ms - window_ms

-- 1. Prune expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

-- 2. Count requests still in the window
local count = redis.call('ZCARD', key)

if count < limit then
  -- 3a. Allow: log this request
  redis.call('ZADD', key, now_ms, request_id)
  redis.call('EXPIRE', key, ttl_sec)
  local remaining = limit - count - 1
  return {1, remaining, now_ms + window_ms}
else
  -- 3b. Deny: find when the oldest entry leaves the window
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_ms
  if oldest and #oldest >= 2 then
    reset_ms = tonumber(oldest[2]) + window_ms
  else
    reset_ms = now_ms + window_ms
  end
  return {0, 0, reset_ms}
end
`;

export async function slidingWindowCheck(
  redis: Redis,
  clientId: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  // Unique member: timestamp + random suffix prevents collisions under concurrency
  const requestId = `${nowMs}:${Math.random().toString(36).slice(2, 9)}`;
  const ttlSeconds = Math.ceil((windowMs / 1000) * 2);
  const key = `rate:sw:${clientId}`;

  const result = (await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    key,
    limit,
    windowMs,
    nowMs,
    requestId,
    ttlSeconds,
  )) as [number, number, number];

  const [allowed, remaining, resetAt] = result;

  return {
    allowed: allowed === 1,
    remaining,
    limit,
    resetAt,
    algorithm: "sliding-window",
  };
}
