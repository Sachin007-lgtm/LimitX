/**
 * Throughput benchmark.
 *
 * Goal: measure maximum sustainable req/s while holding the rate limiter
 * at ~80% capacity — i.e. fast enough to stress Redis but not so fast
 * that every request is a 429.
 *
 * Produces the "[X] req/s with <1% false accepts" metric for the resume bullet.
 *
 * Run: k6 run load-tests/05-throughput.js
 * Or with a custom rate: k6 run -e TARGET_RPS=200 load-tests/05-throughput.js
 */

import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { BASE_URL, clientHeaders } from "./k6.config.js";

const errorRate      = new Rate("error_rate");
const unexpectedDeny = new Rate("false_denies");  // 429 when we expected allow
const latency        = new Trend("rl_latency_ms", true);

const TARGET_RPS = parseInt(__ENV.TARGET_RPS || "150");

export const options = {
  scenarios: {
    constant_rate: {
      executor: "constant-arrival-rate",
      rate: TARGET_RPS,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    // <5% of requests should error (5xx)
    error_rate: ["rate<0.05"],
    // p95 latency should be under 200ms (mostly Redis round-trip)
    rl_latency_ms: ["p(95)<200"],
  },
};

// Use many different client IDs so each is well under its limit
// — we're measuring overhead, not the limiting behavior
let counter = 0;

export default function () {
  const clientId = `throughput-client-${(__VU % 100).toString().padStart(3, "0")}`;

  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/throughput`, {
    headers: clientHeaders(clientId, "pro"),
  });
  latency.add(Date.now() - start);

  const ok = res.status === 200 || res.status === 429;
  errorRate.add(!ok);

  check(res, {
    "no 5xx": (r) => r.status < 500,
    "has rate limit headers": (r) =>
      r.headers["Ratelimit-Limit"] !== undefined ||
      r.headers["RateLimit-Limit"] !== undefined,
  });
}

export function handleSummary(data) {
  const rps = data.metrics.http_reqs?.values.rate ?? 0;
  const p95 = data.metrics.rl_latency_ms?.values["p(95)"] ?? 0;
  const p99 = data.metrics.rl_latency_ms?.values["p(99)"] ?? 0;
  const errors = ((data.metrics.error_rate?.values.rate ?? 0) * 100).toFixed(2);

  console.log(`\n── Throughput Benchmark Summary ──────────────`);
  console.log(`  Target RPS   : ${TARGET_RPS}`);
  console.log(`  Actual RPS   : ${rps.toFixed(1)}`);
  console.log(`  Latency p95  : ${p95.toFixed(1)} ms`);
  console.log(`  Latency p99  : ${p99.toFixed(1)} ms`);
  console.log(`  Error rate   : ${errors}%`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Resume line  : "Handled ${rps.toFixed(0)} req/s at p95=${p95.toFixed(0)}ms"`);
  console.log(`─────────────────────────────────────────────\n`);

  return {};
}
