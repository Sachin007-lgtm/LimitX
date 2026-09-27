/**
 * Core types shared across the rate limiter implementations.
 */

export type Algorithm = "fixed-window" | "token-bucket" | "sliding-window";

/** The decision returned by any rate limiter. */
export interface RateLimitResult {
  allowed: boolean;
  /** Current remaining tokens/requests in this window. */
  remaining: number;
  /** Total limit for this window. */
  limit: number;
  /** Unix timestamp (ms) when the window or bucket resets/refills. */
  resetAt: number;
  /** Which algorithm produced this result. */
  algorithm: Algorithm;
  /** True when the decision was made without Redis (degraded mode). */
  degraded?: boolean;
}

/** Configuration for a single rate limit rule. */
export interface RateLimitRule {
  /** Max requests allowed in the window (or bucket capacity for token-bucket). */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Algorithm to use — defaults to token-bucket. */
  algorithm?: Algorithm;
  /**
   * Token-bucket refill rate (tokens per second).
   * Only used when algorithm = "token-bucket".
   * Defaults to limit / (windowMs / 1000).
   */
  refillRate?: number;
}

/** A matcher maps an incoming request to a rule. */
export interface RouteMatcher {
  /** Regex tested against `${method}:${path}`, e.g. "GET:/api/v1/.*" */
  pattern: string;
  rule: RateLimitRule;
}

/** Full rate limit config loaded at startup. */
export interface RateLimitConfig {
  /** Default rule applied when no client/route rule matches. */
  default: RateLimitRule;
  /**
   * Per-client-tier overrides, keyed by a tier name.
   * The tier name is matched against the X-Client-Tier header.
   */
  tiers: Record<string, RateLimitRule>;
  /** Route-level overrides, checked before tier overrides. */
  routes: RouteMatcher[];
}

/** The context extracted from each incoming request. */
export interface RequestContext {
  /** Stable identifier for the caller (API key, IP, etc.). */
  clientId: string;
  /** Optional tier name from X-Client-Tier header. */
  tier?: string;
  method: string;
  path: string;
}
