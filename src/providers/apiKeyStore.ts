/**
 * apiKeyStore.ts — Postgres-backed API key authentication and usage tracking.
 *
 * Keys are SHA-256 hashed before storage; the raw key is never persisted.
 * A short-lived in-process LRU cache avoids hitting Postgres on every request.
 *
 * Usage is tracked in per-minute buckets so we can enforce both per-minute
 * rate limits and monthly quotas. Buckets older than 60 days are pruned by
 * the reindex job (housekeeping).
 *
 * Schema (applied via scripts/apply-schema.ts):
 *   api_keys(key_hash PK, label, created_at, expires_at, revoked_at,
 *            rate_limit_min, monthly_quota)
 *   api_key_usage(key_hash, bucket, count)
 */

import { createHash, randomBytes } from "node:crypto";
import { LRUCache } from "lru-cache";
import { getPool } from "../lib/pgClient.js";
import { config } from "../config.js";

export interface ApiKeyMetadata {
  keyHash: string;
  label: string;
  rateLimitPerMinute: number;
  monthlyQuota: number;
  expiresAt: Date | null;
}

export interface IssuedKey {
  rawKey: string;
  keyHash: string;
  label: string;
}

export interface KeyUsage {
  perMinute: number;
  monthly: number;
}

const KEY_PREFIX = "gl_";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): string {
  // 32 random bytes → 64 hex chars; total length with prefix is 67.
  return KEY_PREFIX + randomBytes(32).toString("hex");
}

const keyCache = new LRUCache<string, ApiKeyMetadata>({
  max: 1000,
  ttl: config.keyCacheTtlMs,
});

/**
 * Validate a raw API key. Returns the key metadata if valid; throws otherwise.
 */
export async function validateKey(rawKey: string): Promise<ApiKeyMetadata> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) {
    throw new Error("Invalid API key format");
  }
  const keyHash = hashKey(rawKey);

  const cached = keyCache.get(keyHash);
  if (cached) return cached;

  const pool = await getPool();
  const result = await pool.query<{
    key_hash: string;
    label: string;
    rate_limit_min: number;
    monthly_quota: number;
    expires_at: Date | null;
    revoked_at: Date | null;
  }>(
    `SELECT key_hash, label, rate_limit_min, monthly_quota, expires_at, revoked_at
     FROM api_keys
     WHERE key_hash = $1`,
    [keyHash]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Unknown API key");
  if (row.revoked_at) throw new Error("API key has been revoked");
  if (row.expires_at && row.expires_at.getTime() < Date.now()) {
    throw new Error("API key has expired");
  }

  const metadata: ApiKeyMetadata = {
    keyHash: row.key_hash,
    label: row.label,
    rateLimitPerMinute: row.rate_limit_min,
    monthlyQuota: row.monthly_quota,
    expiresAt: row.expires_at,
  };
  keyCache.set(keyHash, metadata);
  return metadata;
}

/**
 * Increment the usage counter for the current minute bucket.
 */
export async function recordUsage(keyHash: string): Promise<void> {
  const pool = await getPool();
  // Truncate to the minute.
  await pool.query(
    `INSERT INTO api_key_usage (key_hash, bucket, count)
     VALUES ($1, date_trunc('minute', NOW()), 1)
     ON CONFLICT (key_hash, bucket) DO UPDATE SET count = api_key_usage.count + 1`,
    [keyHash]
  );
}

/**
 * Get current usage counts for a key (current minute + current month).
 */
export async function getUsage(keyHash: string): Promise<KeyUsage> {
  const pool = await getPool();
  const result = await pool.query<{ per_minute: string; monthly: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN bucket >= date_trunc('minute', NOW())
                         THEN count ELSE 0 END), 0)::text AS per_minute,
       COALESCE(SUM(CASE WHEN bucket >= date_trunc('month', NOW())
                         THEN count ELSE 0 END), 0)::text AS monthly
     FROM api_key_usage
     WHERE key_hash = $1
       AND bucket >= date_trunc('month', NOW())`,
    [keyHash]
  );
  const row = result.rows[0];
  return {
    perMinute: parseInt(row?.per_minute ?? "0", 10),
    monthly: parseInt(row?.monthly ?? "0", 10),
  };
}

/**
 * Issue a new API key. The raw key is returned only here — store it now,
 * because only its sha256 hash is persisted.
 */
export async function issueKey(opts: {
  label: string;
  rateLimitPerMinute?: number;
  monthlyQuota?: number;
  expiresAt?: Date;
}): Promise<IssuedKey> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const pool = await getPool();
  await pool.query(
    `INSERT INTO api_keys
       (key_hash, label, rate_limit_min, monthly_quota, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      keyHash,
      opts.label,
      opts.rateLimitPerMinute ?? 60,
      opts.monthlyQuota ?? 10_000,
      opts.expiresAt ?? null,
    ]
  );
  return { rawKey, keyHash, label: opts.label };
}

/**
 * Revoke an API key by label or hash. Returns the number of rows affected.
 */
export async function revokeKey(labelOrHash: string): Promise<number> {
  const pool = await getPool();
  const result = await pool.query(
    `UPDATE api_keys
     SET revoked_at = NOW()
     WHERE (label = $1 OR key_hash = $1) AND revoked_at IS NULL`,
    [labelOrHash]
  );
  // Best-effort: clear cache entries for revoked keys.
  keyCache.clear();
  return result.rowCount ?? 0;
}

export interface ListedKey {
  label: string;
  keyHashPreview: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  rateLimitPerMinute: number;
  monthlyQuota: number;
  monthlyUsage: number;
}

/** List all API keys with current month usage. */
export async function listKeys(): Promise<ListedKey[]> {
  const pool = await getPool();
  const result = await pool.query<{
    key_hash: string;
    label: string;
    created_at: Date;
    expires_at: Date | null;
    revoked_at: Date | null;
    rate_limit_min: number;
    monthly_quota: number;
    monthly_usage: string;
  }>(
    `SELECT k.key_hash, k.label, k.created_at, k.expires_at, k.revoked_at,
            k.rate_limit_min, k.monthly_quota,
            COALESCE(SUM(u.count) FILTER (WHERE u.bucket >= date_trunc('month', NOW())), 0)::text
              AS monthly_usage
     FROM api_keys k
     LEFT JOIN api_key_usage u ON u.key_hash = k.key_hash
     GROUP BY k.key_hash
     ORDER BY k.created_at DESC`
  );
  return result.rows.map((row) => ({
    label: row.label,
    keyHashPreview: `${row.key_hash.slice(0, 8)}…${row.key_hash.slice(-4)}`,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    rateLimitPerMinute: row.rate_limit_min,
    monthlyQuota: row.monthly_quota,
    monthlyUsage: parseInt(row.monthly_usage, 10),
  }));
}
