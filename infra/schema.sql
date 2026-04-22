-- Gospel Library MCP Server — Postgres schema
-- Apply with: scripts/apply-schema.ts (which executes this file).

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Vector store ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  url        TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,
  embedding  VECTOR(1536) NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS documents_category_idx
  ON documents (category);

-- ── API key management ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash       TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  rate_limit_min INT NOT NULL DEFAULT 60,
  monthly_quota  INT NOT NULL DEFAULT 10000
);

CREATE TABLE IF NOT EXISTS api_key_usage (
  key_hash TEXT NOT NULL REFERENCES api_keys(key_hash) ON DELETE CASCADE,
  bucket   TIMESTAMPTZ NOT NULL,
  count    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, bucket)
);

CREATE INDEX IF NOT EXISTS api_key_usage_bucket_idx
  ON api_key_usage (bucket);
