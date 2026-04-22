/**
 * vectorStore.ts — Postgres + pgvector vector store.
 *
 * Stores article embeddings (1536-dim) with cosine similarity search via an
 * HNSW index. Uses the shared connection pool from lib/pgClient.ts which
 * authenticates via Entra (Managed Identity in Azure, az login locally).
 *
 * Schema (applied via scripts/apply-schema.ts):
 *   documents(url PK, title, category, embedding vector(1536), indexed_at)
 *   HNSW index on embedding using vector_cosine_ops
 */

import { getPool } from "../lib/pgClient.js";
import { EMBEDDING_DIMENSIONS } from "./embedder.js";

export interface VectorDocument {
  url: string;
  title: string;
  category: string;
  embedding: Float32Array;
}

export interface VectorSearchResult {
  url: string;
  title: string;
  category: string;
  score: number;
}

/** Format a Float32Array as a pgvector literal: "[0.1,0.2,...]" */
function toPgVector(embedding: Float32Array): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding length ${embedding.length} does not match expected ${EMBEDDING_DIMENSIONS}`
    );
  }
  return `[${Array.from(embedding).join(",")}]`;
}

/**
 * Cosine-similarity search. Returns up to `k` results, optionally filtered by
 * category prefix (e.g. "/study/general-conference/").
 */
export async function searchByVector(
  embedding: Float32Array,
  category: string | undefined,
  k: number
): Promise<VectorSearchResult[]> {
  const pool = await getPool();
  const vec = toPgVector(embedding);

  const sql = category
    ? `SELECT url, title, category,
              1 - (embedding <=> $1::vector) AS score
       FROM documents
       WHERE category LIKE $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`
    : `SELECT url, title, category,
              1 - (embedding <=> $1::vector) AS score
       FROM documents
       ORDER BY embedding <=> $1::vector
       LIMIT $2`;

  const params = category ? [vec, `${category}%`, k] : [vec, k];

  const result = await pool.query<{
    url: string;
    title: string;
    category: string;
    score: string; // pg returns numerics as strings
  }>(sql, params);

  return result.rows.map((row) => ({
    url: row.url,
    title: row.title,
    category: row.category,
    score: parseFloat(row.score),
  }));
}

/**
 * Upsert one or more documents. Existing rows (by url) are updated.
 */
export async function upsertDocuments(docs: VectorDocument[]): Promise<void> {
  if (docs.length === 0) return;
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const sql = `
      INSERT INTO documents (url, title, category, embedding, indexed_at)
      VALUES ($1, $2, $3, $4::vector, NOW())
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        embedding = EXCLUDED.embedding,
        indexed_at = NOW()
    `;
    for (const doc of docs) {
      await client.query(sql, [doc.url, doc.title, doc.category, toPgVector(doc.embedding)]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Total number of indexed documents. */
export async function getDocumentCount(): Promise<number> {
  const pool = await getPool();
  const result = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM documents");
  return parseInt(result.rows[0].count, 10);
}

/** Whether the index has been populated. */
export async function isIndexBuilt(): Promise<boolean> {
  return (await getDocumentCount()) > 0;
}

/** Return all indexed URLs (used by the reindex job for diff detection). */
export async function getAllIndexedUrls(): Promise<Set<string>> {
  const pool = await getPool();
  const result = await pool.query<{ url: string }>("SELECT url FROM documents");
  return new Set(result.rows.map((r) => r.url));
}
