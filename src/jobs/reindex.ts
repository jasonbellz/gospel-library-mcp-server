/**
 * reindex.ts — Crawl Gospel Library sitemap and (re)build the vector index.
 *
 * Run as a Container Apps Job on a weekly schedule (or manually).
 *
 * Strategy:
 *   1. Fetch the sitemap index, then each sub-sitemap.
 *   2. Filter to indexed path patterns (conference talks, handbook, gospel
 *      topics, Come Follow Me).
 *   3. Diff against existing rows in `documents` — only embed new URLs.
 *   4. Fetch full HTML, convert to markdown, truncate to ~350 words.
 *   5. Embed in batches via Azure OpenAI.
 *   6. Upsert into pgvector.
 *   7. Close the pool and exit.
 *
 * Idempotent — safe to re-run any time.
 */

import { embedBatch } from "../providers/embedder.js";
import { upsertDocuments, getAllIndexedUrls, type VectorDocument } from "../providers/vectorStore.js";
import { getArticle } from "../tools/fetch.js";
import { closePool } from "../lib/pgClient.js";
import { logger } from "../lib/logger.js";

const SITEMAP_INDEX =
  "https://sitemaps.churchofjesuschrist.org/sitemap-service/www.churchofjesuschrist.org/en/index.xml";

const INDEXED_PATH_PATTERNS = [
  "/study/general-conference/",
  "/study/manual/general-handbook/",
  "/study/manual/gospel-topics/",
  "/study/manual/come-follow-me-for-individuals-and-families-",
  "/study/manual/come-follow-me-for-sunday-school-",
];

const FULL_FETCH_CONCURRENCY = 5;
const EMBED_BATCH_SIZE = 16;
const TRUNCATE_WORDS = 350;

function categoryFor(url: string): string {
  // Use the first 4 path segments as the category (e.g. /study/general-conference/2024/10).
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const segments = path.split("/").filter(Boolean).slice(0, 4);
  return "/" + segments.join("/");
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

async function fetchSitemapUrls(): Promise<string[]> {
  logger.info("Fetching sitemap index");
  const indexRes = await fetch(SITEMAP_INDEX);
  if (!indexRes.ok) {
    throw new Error(`Failed to fetch sitemap index: HTTP ${indexRes.status}`);
  }
  const indexXml = await indexRes.text();
  const subSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  logger.info({ count: subSitemaps.length }, "Found sub-sitemaps");

  const allUrls: string[] = [];
  await Promise.all(
    subSitemaps.map(async (sm) => {
      try {
        const r = await fetch(sm);
        if (!r.ok) return;
        const xml = await r.text();
        const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        allUrls.push(...urls);
      } catch (err) {
        logger.warn({ err, sm }, "Failed to fetch sub-sitemap");
      }
    })
  );
  logger.info({ count: allUrls.length }, "Total URLs from sitemap");
  return allUrls;
}

async function fetchAndPrepare(
  url: string
): Promise<{ url: string; title: string; category: string; text: string } | null> {
  try {
    const article = await getArticle(url);
    if (!article.title || !article.content || article.content.length < 50) return null;
    return {
      url,
      title: article.title,
      category: categoryFor(url),
      text: truncateToWords(article.content, TRUNCATE_WORDS),
    };
  } catch (err) {
    logger.warn({ err, url }, "Failed to fetch article");
    return null;
  }
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

export interface ReindexResult {
  added: number;
  skipped: number;
  errors: number;
}

export async function runReindex(): Promise<ReindexResult> {
  logger.info("Starting reindex job");
  const startedAt = Date.now();

  try {
    const allUrls = await fetchSitemapUrls();
    const candidateUrls = allUrls.filter((u) =>
      INDEXED_PATH_PATTERNS.some((p) => u.includes(p))
    );
    logger.info({ count: candidateUrls.length }, "Candidate URLs after filtering");

    const existing = await getAllIndexedUrls();
    const newUrls = candidateUrls.filter((u) => !existing.has(u));
    logger.info(
      { existing: existing.size, new: newUrls.length },
      "Diff against existing index"
    );

    if (newUrls.length === 0) {
      logger.info("No new URLs to index");
      return { added: 0, skipped: existing.size, errors: 0 };
    }

    let added = 0;
    let errors = 0;

    // Fetch + embed in chunks to bound memory.
    const FETCH_CHUNK = 100;
    for (let i = 0; i < newUrls.length; i += FETCH_CHUNK) {
      const chunk = newUrls.slice(i, i + FETCH_CHUNK);
      logger.info(
        { progress: `${i}/${newUrls.length}` },
        "Fetching chunk"
      );

      const prepared = await processInBatches(chunk, FULL_FETCH_CONCURRENCY, fetchAndPrepare);
      const successful = prepared.filter((p): p is NonNullable<typeof p> => p !== null);
      errors += chunk.length - successful.length;

      if (successful.length === 0) continue;

      // Embed in sub-batches.
      const docs: VectorDocument[] = [];
      for (let j = 0; j < successful.length; j += EMBED_BATCH_SIZE) {
        const batch = successful.slice(j, j + EMBED_BATCH_SIZE);
        const embeddings = await embedBatch(batch.map((b) => b.text));
        for (let k = 0; k < batch.length; k++) {
          docs.push({
            url: batch[k].url,
            title: batch[k].title,
            category: batch[k].category,
            embedding: embeddings[k],
          });
        }
      }

      await upsertDocuments(docs);
      added += docs.length;
      logger.info({ added, errors }, "Chunk indexed");
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    logger.info({ added, errors, elapsedSec: elapsed }, "Reindex complete");
    return { added, skipped: existing.size, errors };
  } finally {
    await closePool();
  }
}
