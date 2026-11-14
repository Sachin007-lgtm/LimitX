import Fastify, { FastifyInstance } from "fastify";
import path from "path";
import fastifyStatic from "@fastify/static";
import { config } from "./config";
import rateLimitPlugin from "./middleware/rate-limit";
import healthRoutes from "./routes/health";
import demoRoutes from "./routes/demo";
import gatewayRoutes from "./routes/gateway";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    // Trust X-Forwarded-For from proxies/load balancers
    trustProxy: true,
  });

  // ── Static Frontend UI ────────────────────────────────────────────────────
  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "public"),
    prefix: "/",
  });

  // ── Decorators / plugins ──────────────────────────────────────────────────

  // Rate-limit middleware — runs on every API request
  await app.register(rateLimitPlugin);

  // Proxy forwarding (only when UPSTREAM_URL is set)
  if (config.UPSTREAM_URL) {
    const proxy = await import("@fastify/http-proxy");
    await app.register(proxy.default, {
      upstream: config.UPSTREAM_URL,
      prefix: "/",
      replyOptions: {
        rewriteRequestHeaders: (req, headers) => ({
          ...headers,
          // Forward rate-limit info to upstream so it can log/use it
          "x-rate-limit-remaining": String(req.rateLimitResult?.remaining ?? ""),
          "x-rate-limit-algorithm": req.rateLimitResult?.algorithm ?? "",
        }),
      },
    });
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(demoRoutes);

  if (!config.UPSTREAM_URL) {
    await app.register(gatewayRoutes);
  }

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, "Unhandled error");
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.name ?? "InternalServerError",
      message:
        config.NODE_ENV === "production" ? "An error occurred" : error.message,
    });
  });

  return app;
}
