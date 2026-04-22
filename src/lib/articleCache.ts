/**
 * articleCache.ts — In-process LRU cache for fetched articles.
 *
 * Articles rarely change. Caching them in-process for ~15 minutes avoids
 * repeated round-trips to churchofjesuschrist.org and dramatically reduces
 * latency on common queries.
 *
 * NOTE: Each replica has its own cache. With scale-to-zero / max 3 replicas
 * this is fine; introduce Redis if/when this becomes a problem.
 */

import { LRUCache } from "lru-cache";
import { config } from "../config.js";

export interface CachedArticle<T> {
  value: T;
  cachedAt: number;
}

const cache = new LRUCache<string, object>({
  max: config.articleCacheMaxItems,
  ttl: config.articleCacheTtlMs,
});

export function getCached<T extends object>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached<T extends object>(key: string, value: T): void {
  cache.set(key, value);
}

export function clearCache(): void {
  cache.clear();
}
