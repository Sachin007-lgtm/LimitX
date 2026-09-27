import { resolveRule } from "../src/limits.config";
import type { RateLimitConfig } from "../src/types";

const testConfig: RateLimitConfig = {
  default: { limit: 100, windowMs: 60_000, algorithm: "token-bucket" },
  tiers: {
    free: { limit: 20, windowMs: 60_000, algorithm: "token-bucket" },
    pro:  { limit: 500, windowMs: 60_000, algorithm: "token-bucket" },
  },
  routes: [
    {
      pattern: "POST:/auth/.*",
      rule: { limit: 5, windowMs: 60_000, algorithm: "fixed-window" },
    },
    {
      pattern: "GET:/api/v1/search.*",
      rule: { limit: 30, windowMs: 60_000, algorithm: "sliding-window" },
    },
  ],
};

describe("resolveRule", () => {
  it("returns default rule when no tier or route matches", () => {
    const rule = resolveRule("GET", "/api/v1/users", undefined, testConfig);
    expect(rule.limit).toBe(100);
    expect(rule.algorithm).toBe("token-bucket");
  });

  it("returns tier rule over default", () => {
    const rule = resolveRule("GET", "/api/v1/users", "free", testConfig);
    expect(rule.limit).toBe(20);
  });

  it("returns pro tier rule", () => {
    const rule = resolveRule("GET", "/api/v1/users", "pro", testConfig);
    expect(rule.limit).toBe(500);
  });

  it("returns route rule over tier rule (route has highest priority)", () => {
    const rule = resolveRule("POST", "/auth/login", "pro", testConfig);
    // Route match wins over pro tier
    expect(rule.limit).toBe(5);
    expect(rule.algorithm).toBe("fixed-window");
  });

  it("matches route rule for search endpoint", () => {
    const rule = resolveRule("GET", "/api/v1/search?q=hello", undefined, testConfig);
    expect(rule.limit).toBe(30);
    expect(rule.algorithm).toBe("sliding-window");
  });

  it("is case-insensitive on method", () => {
    const rule = resolveRule("post", "/auth/register", undefined, testConfig);
    expect(rule.limit).toBe(5);
  });

  it("falls back to default for unknown tier", () => {
    const rule = resolveRule("GET", "/api/data", "enterprise", testConfig);
    expect(rule.limit).toBe(100);
  });
});
