import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_FAIL_STRATEGY: z.enum(["open", "closed"]).default("open"),
  DEFAULT_LIMIT: z.coerce.number().default(100),
  DEFAULT_WINDOW_MS: z.coerce.number().default(60_000),
  UPSTREAM_URL: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:", result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
