/**
 * Shared k6 configuration used by all test scripts.
 * Import with: import { BASE_URL, commonHeaders } from './k6.config.js';
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:80";

export const commonHeaders = {
  "Content-Type": "application/json",
};

/**
 * Return headers for a specific API key and tier.
 * Use different keys to simulate different clients.
 */
export function clientHeaders(apiKey, tier = "free") {
  return {
    ...commonHeaders,
    "X-API-Key": apiKey,
    "X-Client-Tier": tier,
  };
}

export function checkRateLimitHeaders(res) {
  return (
    res.headers["Ratelimit-Limit"] !== undefined ||
    res.headers["RateLimit-Limit"] !== undefined
  );
}
