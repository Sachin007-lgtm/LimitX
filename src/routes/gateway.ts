import type { FastifyPluginAsync } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";

/**
 * Gateway routes.
 *
 * Two modes depending on UPSTREAM_URL:
 *
 * 1. Decision-only (UPSTREAM_URL not set):
 *    Returns a JSON body describing the rate-limit decision.
 *    Useful for testing and for services that query the limiter separately.
 *
 * 2. Proxy mode (UPSTREAM_URL set):
 *    Forwards the request upstream via @fastify/http-proxy, which is
 *    registered in app.ts when UPSTREAM_URL is configured.
 *    In proxy mode, allowed requests are forwarded; denied ones are
 *    blocked by the rate-limit middleware before reaching this handler.
 */
const gatewayRoutes: FastifyPluginAsync = async (fastify) => {
  if (config.UPSTREAM_URL) {
    // Proxy mode — @fastify/http-proxy handles forwarding; this handler is
    // only reached if the proxy plugin isn't registered (shouldn't happen).
    fastify.all("/*", async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.status(502).send({ error: "Proxy misconfigured" });
    });
    return;
  }

  // Decision-only handler: echo back the rate-limit result
  const handleDecision = async (req: FastifyRequest, reply: FastifyReply) => {
    const result = req.rateLimitResult;
    const context = req.requestContext;

    // At this point the rate-limit hook already fired; if we got here, allowed = true
    reply.send({
      allowed: true,
      clientId: context?.clientId,
      tier: context?.tier,
      algorithm: result?.algorithm,
      remaining: result?.remaining,
      limit: result?.limit,
      resetAt: result?.resetAt ? new Date(result.resetAt).toISOString() : null,
      degraded: result?.degraded ?? false,
      instanceId: process.env.INSTANCE_ID ?? "gateway-primary",
      request: {
        method: req.method,
        path: req.url,
      },
    });
  };

  // Specific path prefixes to avoid route conflict with static root files
  fastify.all("/api/*", handleDecision);
  fastify.all("/auth/*", handleDecision);
  fastify.all("/webhooks/*", handleDecision);
  fastify.all("/simulate/*", handleDecision);

  // Catch any other non-static route
  fastify.setNotFoundHandler(handleDecision);
};

export default gatewayRoutes;
