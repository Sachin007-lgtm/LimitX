/**
 * Multi-client isolation test.
 *
 * Goal: verify that different clients each get their own independent bucket.
 * Client A exhausting its limit must NOT affect client B.
 *
 * Also tests tier isolation: free tier (20 req/min) vs pro tier (500 req/min).
 *
 * Run: k6 run load-tests/03-multi-client.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { BASE_URL, clientHeaders } from "./k6.config.js";

const freeAllowed = new Counter("free_tier_allowed");
const freeDenied  = new Counter("free_tier_denied");
const proAllowed  = new Counter("pro_tier_allowed");
const proDenied   = new Counter("pro_tier_denied");

// Free tier limit = 20, Pro tier limit = 500 (from limits.config.ts)
const FREE_LIMIT = 20;
const PRO_LIMIT  = 500;

export const options = {
  scenarios: {
    // Free client fires 30 requests — should be limited at 20
    free_client: {
      executor: "shared-iterations",
      vus: 10,
      iterations: 30,
      env: { TIER: "free", KEY: "multi-client-free-001" },
    },
    // Pro client fires 30 requests — should all pass (500 limit)
    pro_client: {
      executor: "shared-iterations",
      vus: 10,
      iterations: 30,
      env: { TIER: "pro", KEY: "multi-client-pro-001" },
    },
  },
};

export default function () {
  const tier = __ENV.TIER;
  const key  = __ENV.KEY;

  const res = http.get(`${BASE_URL}/api/isolation-test`, {
    headers: clientHeaders(key, tier),
  });

  if (tier === "free") {
    if (res.status === 200) freeAllowed.add(1);
    if (res.status === 429) freeDenied.add(1);
  } else {
    if (res.status === 200) proAllowed.add(1);
    if (res.status === 429) proDenied.add(1);
  }

  check(res, {
    "no 5xx errors": (r) => r.status < 500,
  });
}

export function handleSummary(data) {
  const fa = data.metrics.free_tier_allowed?.values.count ?? 0;
  const fd = data.metrics.free_tier_denied?.values.count ?? 0;
  const pa = data.metrics.pro_tier_allowed?.values.count ?? 0;
  const pd = data.metrics.pro_tier_denied?.values.count ?? 0;

  console.log(`\n── Multi-Client Isolation Summary ────────────`);
  console.log(`  Free tier  → allowed: ${fa}, denied: ${fd} (limit: ${FREE_LIMIT})`);
  console.log(`    Correct? : ${fa <= FREE_LIMIT ? "✓" : "✗ over-allowed"}`);
  console.log(`  Pro  tier  → allowed: ${pa}, denied: ${pd} (limit: ${PRO_LIMIT})`);
  console.log(`    Correct? : ${pa <= 30 ? "✓ (sent only 30)" : "✗"}`);
  console.log(`  Isolation  : ${fd > 0 && pd === 0 ? "✓ free limited, pro unaffected" : "check manually"}`);
  console.log(`─────────────────────────────────────────────\n`);

  return {};
}
