import { buildApp } from "./app";
import { config } from "./config";
import { getRedisClient } from "./redis";

async function start(): Promise<void> {
  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down…`);
    try {
      await app.close();
      await getRedisClient().shutdown();
      app.log.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

start();
