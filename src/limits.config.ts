import { RateLimitConfig } from "./types";
import { config } from "./config";

/**
 * Central rate limit rule configuration.
 *
 * In production you'd load this from a database or config service;
 * here it's a plain object so the logic is easy to follow and test.
 */
export const rateLimitConfig: RateLimitConfig = {
  default: {
    limit: config.DEFAULT_LIMIT,        // 100 req
    windowMs: config.DEFAULT_WINDOW_MS, // per 60s
    algorithm: "token-bucket",
  },

  tiers: {
    // Unauthenticated / anonymous callers get the tightest cap
    free: {
      limit: 20,
      windowMs: 60_000,
      algorithm: "token-bucket",
    },
    // Standard paid tier
    pro: {
      limit: 500,
      windowMs: 60_000,
      algorithm: "token-bucket",
    },
    // Internal services — essentially no limit, but still tracked
    internal: {
      limit: 10_000,
      windowMs: 60_000,
      algorithm: "sliding-window",
    },
  },

  routes: [
    // Auth endpoints — tight, fixed window to prevent brute-force
    {
      pattern: "POST:/auth/.*",
      rule: {
        limit: 5,
        windowMs: 60_000,
        algorithm: "fixed-window",
      },
    },
    // Heavy read endpoint — sliding window for smoothness
    {
      pattern: "GET:/api/v1/search.*",
      rule: {
        limit: 30,
        windowMs: 60_000,
        algorithm: "sliding-window",
      },
    },
    // Webhooks — token bucket with low refill
    {
      pattern: "POST:/webhooks/.*",
      rule: {
        limit: 50,
        windowMs: 60_000,
        refillRate: 1, // 1 token/s
        algorithm: "token-bucket",
      },
    },
  ],
};

/**
 * Resolve the rule that applies to a given request context.
 * Priority: route match > tier > default.
 */
export function resolveRule(
  method: string,
  path: string,
  tier: string | undefined,
  cfg: RateLimitConfig = rateLimitConfig,
): NonNullable<RateLimitConfig["default"]> {
  const routeKey = `${method.toUpperCase()}:${path}`;

  // 1. Route-level rules take highest priority
  for (const matcher of cfg.routes) {
    if (new RegExp(matcher.pattern).test(routeKey)) {
      return matcher.rule;
    }
  }

  // 2. Client tier
  if (tier && cfg.tiers[tier]) {
    return cfg.tiers[tier];
  }

  // 3. Default
  return cfg.default;
}
