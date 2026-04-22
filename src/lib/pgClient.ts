/**
 * pgClient.ts — Shared PostgreSQL connection pool with Entra token auth.
 *
 * Uses DefaultAzureCredential to obtain Entra access tokens scoped to
 * Azure Database for PostgreSQL. The token is used as the Postgres password
 * and must be refreshed before it expires (typically ~1 hour).
 *
 * For local development, the same code path works with `az login` — the
 * AzureCLI credential will be picked up by DefaultAzureCredential.
 */

import pkg from "pg";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "../config.js";
import { logger } from "./logger.js";

const { Pool } = pkg;
type PoolType = InstanceType<typeof Pool>;

// Scope for Azure Database for PostgreSQL Entra tokens.
const POSTGRES_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";

// Refresh the cached token when it has < 5 minutes remaining.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresOnTimestamp: number;
}

let pool: PoolType | null = null;
let cachedToken: CachedToken | null = null;
const credential = new DefaultAzureCredential({
  managedIdentityClientId: config.azureClientId || undefined,
});

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresOnTimestamp - now > TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.token;
  }
  logger.debug("Refreshing Postgres Entra access token");
  const tokenResponse = await credential.getToken(POSTGRES_SCOPE);
  if (!tokenResponse) {
    throw new Error("Failed to obtain Entra token for PostgreSQL");
  }
  cachedToken = {
    token: tokenResponse.token,
    expiresOnTimestamp: tokenResponse.expiresOnTimestamp,
  };
  return cachedToken.token;
}

export async function getPool(): Promise<PoolType> {
  if (pool) return pool;

  pool = new Pool({
    host: config.postgresHost,
    database: config.postgresDb,
    user: config.postgresUser,
    port: config.postgresPort,
    ssl: config.postgresSsl ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // pg supports a function for `password` that's invoked per connection,
    // making token refresh transparent.
    password: async () => getAccessToken(),
  });

  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected error on idle Postgres client");
  });

  // Verify connectivity on first use.
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    logger.info("Connected to PostgreSQL");
  } finally {
    client.release();
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
