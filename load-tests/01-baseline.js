/**
 * Baseline load test — single client, sequential requests.
 *
 * Goal: confirm the limiter allows exactly `limit` requests then blocks,
 * and that headers are set correctly.
 *
 * Run: k6 run load-tests/01-baseline.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { BASE_URL, clientHeaders } from "./k6.config.js";

const allowed = new Counter("requests_allowed");
const denied  = new Counter("requests_denied");
const limitAccuracy = new Rate("limit_accuracy"); // % of 429s that were correct

// Send 120 requests in 1 VU — we expect the first 100 to pass, rest to 429
export const options = {
  vus: 1,
  iterations: 120,
  // No duration limit — just run all iterations
};

const EXPECTED_LIMIT = 100;

export default function () {
  const res = http.get(`${BASE_URL}/api/test`, {
    headers: clientHeaders("baseline-client-001", "free"),
  });

  const isAllowed = res.status === 200;
  const isDenied  = res.status === 429;

  if (isAllowed) allowed.add(1);
  if (isDenied)  denied.add(1);

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "has RateLimit-Limit header": (r) =>
      r.headers["Ratelimit-Limit"] !== undefined ||
      r.headers["RateLimit-Limit"] !== undefined,
    "has RateLimit-Remaining header": (r) =>
      r.headers["Ratelimit-Remaining"] !== undefined ||
      r.headers["RateLimit-Remaining"] !== undefined,
    "has RateLimit-Reset header": (r) =>
      r.headers["Ratelimit-Reset"] !== undefined ||
      r.headers["RateLimit-Reset"] !== undefined,
    "429 body has retryAfter": (r) =>
      r.status !== 429 || JSON.parse(r.body).retryAfter !== undefined,
  });
}

export function handleSummary(data) {
  const allowedCount = data.metrics.requests_allowed?.values.count ?? 0;
  const deniedCount  = data.metrics.requests_denied?.values.count ?? 0;

  console.log(`\n── Baseline Summary ──────────────────────────`);
  console.log(`  Allowed requests : ${allowedCount}`);
  console.log(`  Denied  requests : ${deniedCount}`);
  console.log(`  Expected limit   : ${EXPECTED_LIMIT}`);
  console.log(`  Limit accurate?  : ${allowedCount <= EXPECTED_LIMIT ? "✓ YES" : "✗ NO (over-allowed)"}`);
  console.log(`─────────────────────────────────────────────\n`);

  return {};
}
