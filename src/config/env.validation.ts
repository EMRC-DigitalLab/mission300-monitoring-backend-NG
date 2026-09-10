import { z } from "zod";

// Fails startup fast and loudly if a required env var is missing or malformed,
// instead of letting the app boot into a half-configured state.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),

  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_EXCHANGE: z.string().min(1).default("m300.events"),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),

  CORS_ORIGIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
