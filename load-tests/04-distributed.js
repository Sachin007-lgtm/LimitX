/**
 * Distributed enforcement test.
 *
 * Goal: fire requests alternately at gateway-1 (port 3000) and gateway-2
 * (port 3001) using the same client key and confirm the COMBINED total
 * never exceeds the limit — proving limits are global, not per-instance.
 *
 * Prerequisite: docker-compose up (both gateway instances must be running)
 *
 * Run: k6 run load-tests/04-distributed.js
 */

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { clientHeaders } from "./k6.config.js";

const GW1 = __ENV.GW1 || "http://localhost:3000";
const GW2 = __ENV.GW2 || "http://localhost:3001";

const gw1Allowed = new Counter("gw1_allowed");
const gw1Denied  = new Counter("gw1_denied");
const gw2Allowed = new Counter("gw2_allowed");
const gw2Denied  = new Counter("gw2_denied");

const LIMIT = 100;
const TOTAL_REQUESTS = 150; // 75 to each node

export const options = {
  scenarios: {
    gateway1: {
      executor: "shared-iterations",
      vus: 25,
      iterations: TOTAL_REQUESTS / 2,
      env: { NODE: "1" },
    },
    gateway2: {
      executor: "shared-iterations",
      vus: 25,
      iterations: TOTAL_REQUESTS / 2,
      env: { NODE: "2" },
    },
  },
};

const SHARED_KEY = "distributed-test-client-001";

export default function () {
  const node = __ENV.NODE;
  const url = node === "1"
    ? `${GW1}/api/distributed`
    : `${GW2}/api/distributed`;

  const res = http.get(url, {
    headers: clientHeaders(SHARED_KEY, "default"),
  });

  if (node === "1") {
    if (res.status === 200) gw1Allowed.add(1);
    if (res.status === 429) gw1Denied.add(1);
  } else {
    if (res.status === 200) gw2Allowed.add(1);
    if (res.status === 429) gw2Denied.add(1);
  }

  check(res, {
    "no 5xx": (r) => r.status < 500,
    "valid status": (r) => r.status === 200 || r.status === 429,
  });
}

export function handleSummary(data) {
  const g1a = data.metrics.gw1_allowed?.values.count ?? 0;
  const g1d = data.metrics.gw1_denied?.values.count ?? 0;
  const g2a = data.metrics.gw2_allowed?.values.count ?? 0;
  const g2d = data.metrics.gw2_denied?.values.count ?? 0;

  const totalAllowed = g1a + g2a;
  const totalDenied  = g1d + g2d;

  console.log(`\n── Distributed Enforcement Summary ───────────`);
  console.log(`  Gateway 1 → allowed: ${g1a}, denied: ${g1d}`);
  console.log(`  Gateway 2 → allowed: ${g2a}, denied: ${g2d}`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Total allowed : ${totalAllowed} / ${LIMIT} limit`);
  console.log(`  Total denied  : ${totalDenied}`);
  console.log(`  Result        : ${totalAllowed <= LIMIT
    ? "✓ PASS — global limit held across both instances"
    : `✗ FAIL — over-allowed by ${totalAllowed - LIMIT} (per-instance leak?)`}`);
  console.log(`─────────────────────────────────────────────\n`);

  return {};
}
