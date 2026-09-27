/**
 * Concurrency stress test — the critical correctness test.
 *
 * Goal: fire many concurrent requests from a SINGLE client and confirm the
 * total allowed never exceeds the configured limit. If the rate limiter has
 * a race condition (no Lua atomicity), you'll see allowed > limit here.
 *
 * This is the test that FAILS on a naive non-atomic implementation and
 * PASSES on the Lua-script implementation.
 *
 * Run: k6 run load-tests/02-concurrency.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { BASE_URL, clientHeaders } from "./k6.config.js";

const allowed = new Counter("requests_allowed");
const denied  = new Counter("requests_denied");

const LIMIT = 100;  // must match DEFAULT_LIMIT in .env / docker-compose
const VUS   = 50;   // 50 virtual users firing simultaneously
const ITER  = 4;    // each VU fires 4 requests = 200 total (2× the limit)

export const options = {
  vus: VUS,
  iterations: VUS * ITER,  // 200 total
  // All VUs start at the same time (no ramp-up) to maximise concurrency
  startVUs: VUS,
};

// All VUs use the SAME client key — they're competing for the same bucket
const SHARED_KEY = "concurrency-stress-client";

export default function () {
  const res = http.get(`${BASE_URL}/api/concurrent`, {
    headers: clientHeaders(SHARED_KEY, "default"),
  });

  if (res.status === 200) allowed.add(1);
  if (res.status === 429) denied.add(1);

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "no unexpected 5xx": (r) => r.status < 500,
  });
}

export function handleSummary(data) {
  const allowedCount = data.metrics.requests_allowed?.values.count ?? 0;
  const deniedCount  = data.metrics.requests_denied?.values.count ?? 0;
  const total = allowedCount + deniedCount;

  const overAllowed = allowedCount - LIMIT;
  const passed = allowedCount <= LIMIT;

  console.log(`\n── Concurrency Test Summary ──────────────────`);
  console.log(`  Total requests   : ${total}`);
  console.log(`  Allowed          : ${allowedCount}`);
  console.log(`  Denied (429)     : ${deniedCount}`);
  console.log(`  Limit            : ${LIMIT}`);
  console.log(`  Over-allowed     : ${overAllowed > 0 ? overAllowed + " ← RACE CONDITION DETECTED" : "0 ✓"}`);
  console.log(`  Result           : ${passed ? "✓ PASS — limit held under concurrency" : "✗ FAIL — race condition"}`);
  console.log(`─────────────────────────────────────────────\n`);

  return {};
}
