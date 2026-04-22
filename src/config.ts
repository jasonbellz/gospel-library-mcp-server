/**
 * config.ts — Environment variable loading and validation.
 *
 * All configuration comes from environment variables (set by Container Apps
 * from Bicep). The schema below documents every accepted variable; missing
 * required variables cause startup to fail fast.
 */

import { z } from "zod";

const Schema = z.object({
  mode: z.enum(["server", "reindex", "test"]).default("server"),
  port: z.coerce.number().int().positive().default(3000),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // Postgres
  postgresHost: z.string().min(1),
  postgresDb: z.string().default("gospel"),
  postgresUser: z.string().min(1),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresSsl: z.coerce.boolean().default(true),

  // Azure OpenAI
  azureOpenAiEndpoint: z.string().url(),
  azureOpenAiDeployment: z.string().default("text-embedding-3-small"),
  azureOpenAiApiVersion: z.string().default("2024-10-21"),

  // Managed Identity
  azureClientId: z.string().default(""),

  // Caching
  articleCacheMaxItems: z.coerce.number().int().positive().default(500),
  articleCacheTtlMs: z.coerce.number().int().positive().default(15 * 60 * 1000),
  keyCacheTtlMs: z.coerce.number().int().positive().default(60 * 1000),

  // Rate limiting
  rateLimitPerIp: z.coerce.number().int().positive().default(60),
  rateLimitWindow: z.string().default("1 minute"),
});

export type Config = z.infer<typeof Schema>;

function loadConfig(): Config {
  const raw = {
    mode: process.env.MODE,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    postgresHost: process.env.POSTGRES_HOST,
    postgresDb: process.env.POSTGRES_DB,
    postgresUser: process.env.POSTGRES_USER,
    postgresPort: process.env.POSTGRES_PORT,
    postgresSsl: process.env.POSTGRES_SSL,
    azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    azureClientId: process.env.AZURE_CLIENT_ID,
    articleCacheMaxItems: process.env.ARTICLE_CACHE_MAX_ITEMS,
    articleCacheTtlMs: process.env.ARTICLE_CACHE_TTL_MS,
    keyCacheTtlMs: process.env.KEY_CACHE_TTL_MS,
    rateLimitPerIp: process.env.RATE_LIMIT_PER_IP,
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW,
  };

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const config: Config = loadConfig();
