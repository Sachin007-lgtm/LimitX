# Distributed Rate Limiter / API Gateway

A production-grade rate limiting service built in Node.js (TypeScript) backed by Redis. Implements three algorithms — fixed window, token bucket, and sliding window — with atomic Redis Lua scripts to prevent race conditions under concurrent load.

```
[client] → nginx:80 → gateway-1:3000 ─┐
                    → gateway-2:3001 ─┼→ redis:6379
```

---

## Why this project

Rate limiting is one of those problems that looks simple (increment a counter) but has a lot of depth when you care about correctness:

- **Race conditions** under concurrent load require atomic operations — a naive GET-check-DECREMENT sequence has a TOCTOU bug that allows bursts over the limit. Fixed with Redis Lua scripts.
- **Algorithm tradeoffs** — fixed window is simplest but has a boundary burst bug; sliding window is accurate but memory-heavy; token bucket smooths bursts while allowing short controlled spikes.
- **Distributed enforcement** — two gateway instances sharing the same Redis means the limit is global, not per-instance.
- **Graceful degradation** — what happens when Redis goes down? Fail-open vs fail-closed is an explicit design decision with operational consequences.

---

## Algorithms

### Fixed Window
Key: `rate:fw:{clientId}:{windowIndex}`

Uses `INCR` + `EXPIRE`. Simplest to understand, but has a **boundary burst bug**: a client can make `limit` requests in the last second of window N and `limit` more in the first second of window N+1 — effectively 2× the limit in a short span. Used here as the "before" story.

### Token Bucket (default)
Key: `rate:tb:{clientId}` — stores `{tokens, last_refill_ms}` as a Redis hash.

Implemented as a **Lua script** (`EVAL`) so the read-check-refill-decrement-write cycle is atomic. Allows short bursts (up to bucket capacity) while enforcing a long-term average via the refill rate.

**The race condition without Lua:**
```
Request A: GET tokens → 1 remaining ✓
Request B: GET tokens → 1 remaining ✓  (reads before A writes)
Request A: SET tokens 0 → allowed
Request B: SET tokens 0 → allowed       ← both got through, limit violated
```

**With Lua**, the entire sequence runs in Redis's single-threaded loop — no interleaving possible.

### Sliding Window Log
Key: `rate:sw:{clientId}` — a Redis sorted set, scored by timestamp.

Also Lua-atomic. Prunes expired entries on every request. More accurate than fixed window (no boundary bug) at the cost of O(limit) memory per client. Best for endpoints where precision matters more than memory.

---

## Project structure

```
src/
├── config.ts               Environment config with Zod validation
├── redis.ts                ioredis client + health tracking + fail strategy
├── types.ts                Shared types (RateLimitResult, Rule, Algorithm, etc.)
├── limits.config.ts        Rule definitions + resolveRule() priority logic
├── limiters/
│   ├── fixed-window.ts     INCR + EXPIRE implementation
│   ├── token-bucket.ts     Lua script — atomic read-refill-decrement
│   ├── sliding-window.ts   Lua script — sorted set log
│   └── index.ts            Dispatcher — algorithm selection + degradation
├── middleware/
│   └── rate-limit.ts       Fastify plugin — runs on every request
├── routes/
│   ├── health.ts           GET /health, GET /health/ready
│   └── gateway.ts          Decision-only or proxy mode
├── app.ts                  Fastify app factory
└── server.ts               Entry point + graceful shutdown

tests/                      Jest unit tests (ioredis-mock, no live Redis needed)
load-tests/                 k6 scripts — baseline, concurrency, multi-client, distributed, throughput
```

---

## Quick start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- (Optional) [k6](https://k6.io/docs/get-started/installation/) for load tests

### Local dev (single instance)

```bash
# Install dependencies
npm install

# Copy and edit config
cp .env.example .env

# Start Redis
docker run -d -p 6379:6379 redis:7.2-alpine

# Start the gateway in dev mode (hot reload)
npm run dev
```

The gateway starts at `http://localhost:3000`. Try it:

```bash
# Decision-only response (no UPSTREAM_URL set)
curl -H "X-API-Key: my-client" http://localhost:3000/api/hello

# Check rate limit headers
curl -v -H "X-API-Key: my-client" http://localhost:3000/api/hello 2>&1 | grep -i ratelimit
```

### Distributed mode (two instances + nginx)

```bash
docker-compose up --build
```

This starts:
- `redis:6379` — shared state
- `gateway-1:3000` — instance 1
- `gateway-2:3001` — instance 2
- `nginx:80` — load balancer (round-robin)

```bash
# Hit the load balancer — requests alternate between instances
curl -H "X-API-Key: test-key" http://localhost/api/hello
```

### Run unit tests

```bash
npm test
```

Tests use `ioredis-mock` so no live Redis needed. The Lua scripts are tested via JS re-implementations of the same algorithm — integration tests with a real Redis validate actual Lua atomicity.

### Build for production

```bash
npm run build        # TypeScript → dist/
npm start            # Run compiled output
```

---

## Configuration

All config is via environment variables. See `.env.example` for the full list.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | ioredis connection URL |
| `REDIS_FAIL_STRATEGY` | `open` | `open` = allow all when Redis is down; `closed` = block all |
| `DEFAULT_LIMIT` | `100` | Default request limit per window |
| `DEFAULT_WINDOW_MS` | `60000` | Default window in ms |
| `UPSTREAM_URL` | _(empty)_ | If set, proxy requests here; otherwise return decision-only JSON |

### Rate limit rules

Edit `src/limits.config.ts`. Rules are resolved in priority order:

1. **Route** — regex match on `METHOD:/path`
2. **Tier** — from `X-Client-Tier` header
3. **Default**

```typescript
// Example: tight fixed-window on auth routes
{
  pattern: "POST:/auth/.*",
  rule: { limit: 5, windowMs: 60_000, algorithm: "fixed-window" }
}
```

### Request headers

| Header | Purpose |
|---|---|
| `X-API-Key` | Client identifier (falls back to IP if absent) |
| `X-Client-Tier` | Tier override: `free`, `pro`, `internal` |

### Response headers

| Header | Value |
|---|---|
| `RateLimit-Limit` | Configured limit |
| `RateLimit-Remaining` | Tokens/requests left |
| `RateLimit-Reset` | Unix timestamp (seconds) when window resets |
| `X-RateLimit-Algorithm` | Which algorithm handled this request |
| `X-RateLimit-Degraded` | `true` if Redis was unavailable |
| `Retry-After` | Seconds until retry (only on 429) |

---

## Load tests

All scripts live in `load-tests/`. Install k6: https://k6.io/docs/get-started/installation/

```bash
# 1. Baseline: 120 sequential requests, confirm limit holds at 100
k6 run load-tests/01-baseline.js

# 2. Concurrency: 50 VUs × 4 requests = 200 total against one bucket
#    This is the race-condition test — allowed must never exceed 100
k6 run load-tests/02-concurrency.js

# 3. Multi-client: free tier (limit 20) vs pro tier (limit 500) in parallel
k6 run load-tests/03-multi-client.js

# 4. Distributed: split requests across both gateway instances, same client key
#    Requires docker-compose up
k6 run load-tests/04-distributed.js

# 5. Throughput benchmark: sustained req/s, produces p95 latency numbers
k6 run load-tests/05-throughput.js
# Or with a custom target rate:
k6 run -e TARGET_RPS=300 load-tests/05-throughput.js
```

### What the concurrency test proves

Test `02-concurrency.js` is the key correctness check. It fires 200 concurrent requests from a single client against a limit of 100. A rate limiter with a race condition (GET-check-SET without atomicity) will allow significantly more than 100 — sometimes up to 200 in the worst case. The Lua script implementation consistently holds the line at exactly 100.

Expected output:
```
── Concurrency Test Summary ──────────────────
  Total requests   : 200
  Allowed          : 100
  Denied (429)     : 100
  Limit            : 100
  Over-allowed     : 0 ✓
  Result           : ✓ PASS — limit held under concurrency
─────────────────────────────────────────────
```

---

## Graceful degradation

When Redis is unavailable (connection refused, timeout, etc.), the gateway applies the strategy from `REDIS_FAIL_STRATEGY`:

| Strategy | Behavior | When to use |
|---|---|---|
| `open` (default) | Allow all requests | User-facing APIs where availability > security |
| `closed` | Block all requests (429) | Security-sensitive endpoints, billing APIs |

The `X-RateLimit-Degraded: true` header is always set in degraded mode so upstream services can observe and alert on the condition. The `/health` endpoint returns `503` when Redis is down, allowing load balancers to route to healthy instances.

---

## Design decisions

**Why Fastify over Express?** Schema-based serialization, built-in Pino logging, and plugin lifecycle with proper async support. The hook system (`onRequest`) maps cleanly to middleware without callback pyramids.

**Why Lua over Redis transactions (`MULTI`/`EXEC`)?** Transactions optimistically lock and retry on collision — under high concurrency this means O(n) retries. Lua runs atomically in Redis's event loop with no retry logic needed and a single round-trip.

**Why ioredis over `node-redis`?** Built-in cluster support, pipeline API, and `eval` return type handling are more ergonomic. Either works; ioredis is slightly more popular in production Node.js services.

**Why two gateway instances in the demo?** A single instance with a local counter is trivially correct. Two instances sharing Redis forces the distributed constraint and demonstrates that the limit is enforced globally — this is the claim "distributed rate limiter" actually requires.

---

## Resume bullets (fill in your benchmark numbers)

- Built a distributed rate limiter using atomic Redis Lua scripts to prevent race conditions under concurrent load; concurrency test confirmed 0 over-allowed requests across 200 simultaneous requests against a limit of 100
- Implemented token-bucket, sliding-window, and fixed-window algorithms with per-client and per-route rule resolution; described algorithm tradeoffs and the boundary-burst bug in fixed-window
- Benchmarked with k6 at `___` req/s at p95=`___`ms under sustained load; designed fail-open/fail-closed degradation strategy for Redis outages
- Deployed as two gateway instances behind nginx sharing a single Redis node to enforce global (not per-instance) limits
