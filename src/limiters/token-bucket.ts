import type Redis from "ioredis";
import type { RateLimitResult } from "../types";

/**
 * Token-bucket rate limiter implemented as an atomic Redis Lua script.
 *
 * WHY LUA?
 * ---------
 * Without atomicity, two concurrent requests could both execute:
 *   1. GET tokens  → both read "1 token left"
 *   2. (both pass the "tokens > 0" check)
 *   3. SET tokens 0  → both succeed
 * That lets two requests through when only one token remained — a classic
 * TOCTOU (time-of-check / time-of-use) race condition.
 *
 * A Lua script runs inside Redis's single-threaded event loop, so the
 * entire read-check-decrement-write sequence is guaranteed to execute
 * without interleaving. No locks, no retries, one round-trip.
 *
 * ALGORITHM
 * ----------
 * State stored per key: [tokens, lastRefillTimestamp]
 *
 * On each request:
 *   1. Calculate elapsed time since last refill.
 *   2. Add (elapsed * refillRate) tokens, clamped to capacity.
 *   3. If tokens >= 1: decrement, allow.
 *      Else: deny.
 *   4. Persist new state with TTL = ceil(capacity / refillRate) * 2.
 */

// The Lua script. KEYS[1] = bucket key, ARGV order:
//   [1] capacity  [2] refillRate (tokens/sec)  [3] now (ms)  [4] ttl (seconds)
const TOKEN_BUCKET_SCRIPT = `
local key          = KEYS[1]
local capacity     = tonumber(ARGV[1])
local refill_rate  = tonumber(ARGV[2])  -- tokens per second
local now_ms       = tonumber(ARGV[3])
local ttl_seconds  = tonumber(ARGV[4])

-- Load existing state
local data = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
local tokens        = tonumber(data[1])
local last_refill   = tonumber(data[2])

-- First request: initialise to full bucket minus one token
if tokens == nil or last_refill == nil then
  tokens       = capacity - 1
  last_refill  = now_ms
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', last_refill)
  redis.call('EXPIRE', key, ttl_seconds)
  -- [allowed=1, remaining=tokens, resetAt=now + ceil(1/refillRate)*1000]
  local reset_ms = now_ms + math.ceil(1000 / refill_rate)
  return {1, tokens, reset_ms}
end

-- Refill: how many tokens have accumulated since last refill?
local elapsed_sec = (now_ms - last_refill) / 1000
local new_tokens  = math.min(capacity, tokens + elapsed_sec * refill_rate)

if new_tokens >= 1 then
  -- Allow: consume one token
  new_tokens = new_tokens - 1
  redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill_ms', now_ms)
  redis.call('EXPIRE', key, ttl_seconds)
  local reset_ms = now_ms  -- bucket already has tokens, no wait needed
  return {1, math.floor(new_tokens), reset_ms}
else
  -- Deny: update last_refill so future refills are calculated correctly
  -- but do NOT reset last_refill_ms so the clock keeps ticking
  redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill_ms', now_ms)
  redis.call('EXPIRE', key, ttl_seconds)
  -- How many ms until 1 token is available?
  local ms_until_token = math.ceil((1 - new_tokens) / refill_rate * 1000)
  local reset_ms = now_ms + ms_until_token
  return {0, 0, reset_ms}
end
`;

export async function tokenBucketCheck(
  redis: Redis,
  clientId: string,
  capacity: number,
  windowMs: number,
  refillRate?: number,
): Promise<RateLimitResult> {
  // Default refill rate: fill the bucket in one window period
  const rate = refillRate ?? capacity / (windowMs / 1000);
  const ttlSeconds = Math.ceil((capacity / rate) * 2);
  const nowMs = Date.now();
  const key = `rate:tb:${clientId}`;

  const result = (await redis.eval(
    TOKEN_BUCKET_SCRIPT,
    1,             // number of keys
    key,           // KEYS[1]
    capacity,      // ARGV[1]
    rate,          // ARGV[2]
    nowMs,         // ARGV[3]
    ttlSeconds,    // ARGV[4]
  )) as [number, number, number];

  const [allowed, remaining, resetAt] = result;

  return {
    allowed: allowed === 1,
    remaining,
    limit: capacity,
    resetAt,
    algorithm: "token-bucket",
  };
}
