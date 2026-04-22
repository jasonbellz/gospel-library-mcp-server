/**
 * search.ts — Semantic search via pgvector.
 *
 * No sitemap fallback in the hosted version — if the index is empty, the
 * search returns an empty array and logs a warning. The reindex job is
 * responsible for keeping it populated.
 */

import { embed } from "../providers/embedder.js";
import { searchByVector, isIndexBuilt } from "../providers/vectorStore.js";
import { DEFAULT_LANG } from "../lib/locale.js";
import { logger } from "../lib/logger.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Category aliases for convenience (mapped to URL substrings).
const CATEGORY_ALIASES: Record<string, string> = {
  "general-conference": "/study/general-conference",
  scriptures: "/study/scriptures",
  manual: "/study/manual",
  liahona: "/study/liahona",
  ensign: "/study/ensign",
  friend: "/study/friend",
  handbooks: "/study/manual/general-handbook",
  "come-follow-me": "/study/manual/come-follow-me",
  cfm: "/study/manual/come-follow-me",
};

export async function searchGospelLibrary(
  query: string,
  category?: string,
  maxResults = 5
): Promise<SearchResult[]> {
  if (!(await isIndexBuilt())) {
    logger.warn("Vector index is empty — search returning no results");
    return [];
  }

  const queryEmbedding = await embed(query);
  const categoryFilter = category ? (CATEGORY_ALIASES[category] ?? `/study/${category}`) : undefined;

  // Fetch extra candidates to allow lexical re-ranking.
  const rawResults = await searchByVector(queryEmbedding, categoryFilter, maxResults * 3);

  // Lexical boost: pure vector similarity can rank semantically-adjacent
  // content above the canonical page for a well-known topic. A small lexical
  // boost on title/slug matches corrects this.
  const queryLower = query.toLowerCase();
  const querySlug = queryLower.replace(/\s+/g, "-");
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  const scored = rawResults.map((r) => {
    let score = r.score;
    const titleLower = r.title.toLowerCase();
    const slug = r.url.replace(/[?#].*$/, "").split("/").pop()?.toLowerCase() ?? "";
    if (titleLower.includes(queryLower)) score += 0.15;
    if (slug.includes(querySlug)) score += 0.1;
    if (queryTerms.length > 0) {
      const matched = queryTerms.filter((t) => titleLower.includes(t)).length;
      score += (matched / queryTerms.length) * 0.05;
    }
    return { ...r, score };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxResults);

  return top.map((r) => ({
    title: r.title,
    url: r.url.includes("lang=")
      ? r.url
      : `${r.url}${r.url.includes("?") ? "&" : "?"}lang=${DEFAULT_LANG}`,
    snippet: `Relevance: ${(r.score * 100).toFixed(0)}% — Use get_article to read full content.`,
  }));
}
