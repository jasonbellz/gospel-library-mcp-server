/**
 * browse.ts — Browse a Gospel Library category or collection index page.
 *
 * v2.4.3 fix carried over: do NOT remove <nav> elements when stripping
 * site chrome — Gospel Library wraps conference talk links in <nav>, so
 * removing them wipes out all results. The depth filter handles breadcrumbs.
 */

import * as cheerio from "cheerio";
import { DEFAULT_LANG } from "../lib/locale.js";
import { getCached, setCached } from "../lib/articleCache.js";
import { logger } from "../lib/logger.js";

const BASE = "https://www.churchofjesuschrist.org";

const HTTP_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (compatible; GospelLibraryMCPServer/1.0)",
};

export interface ArticleLink {
  title: string;
  url: string;
  description?: string;
}

export interface CategoryPage {
  title: string;
  url: string;
  articles: ArticleLink[];
  notFound?: boolean;
  suggestion?: string;
}

export async function browseCategory(category: string, lang?: string): Promise<CategoryPage> {
  const cleanCategory = category.replace(/^\/+|\/+$/g, "");
  const useLang = lang ?? DEFAULT_LANG;
  const url = `${BASE}/study/${cleanCategory}?lang=${useLang}`;

  const cached = getCached<CategoryPage>(`browse:${url}`);
  if (cached) {
    logger.debug({ url }, "Browse cache hit");
    return cached;
  }

  const response = await fetch(url, { headers: HTTP_HEADERS });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        title: "Category Not Found",
        url,
        articles: [],
        notFound: true,
        suggestion:
          `The category path "${category}" was not found (HTTP 404).\n\n` +
          `IMPORTANT: Category paths are exact and often year-specific. Common mistakes:\n` +
          `  ❌ manual/come-follow-me\n` +
          `  ✅ manual/come-follow-me-for-individuals-and-families-new-testament-2023\n` +
          `  ✅ manual/come-follow-me-for-sunday-school-new-testament-2023\n\n` +
          `Use search_gospel_library with a descriptive query to discover the correct path first.`,
      };
    }
    throw new Error(`Failed to fetch category ${category}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const pageTitle =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  const articles: ArticleLink[] = [];

  // NOTE: do NOT remove <nav> here — conference index pages wrap all talk links
  // in <nav> elements, so removing nav would wipe out all results. Depth filter
  // below handles ancestor/breadcrumb links instead.
  $(
    "header, footer, " +
      "[class*='breadcrumb'], [class*='navigation'], " +
      "[class*='lc-nav'], [class*='lc-header'], [class*='lc-footer']"
  ).remove();

  const currentDepth = url.split("?")[0].split("/").filter(Boolean).length;

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    if (
      !href.startsWith("/study/") &&
      !href.startsWith("https://www.churchofjesuschrist.org/study/")
    ) {
      return;
    }
    const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
    const normalised = fullUrl.split("?")[0];
    const currentPath = url.split("?")[0];
    if (normalised === currentPath) return;

    // Skip ancestor/parent links (anything shallower than current page).
    const linkDepth = normalised.split("/").filter(Boolean).length;
    if (linkDepth < currentDepth) return;

    const title =
      $(el).find("h4, h3, h2, h5, strong").first().text().trim() || $(el).text().trim();
    if (!title || title.length < 2) return;

    const description = $(el).find("p").first().text().trim() || undefined;

    if (!articles.some((a) => a.url === fullUrl)) {
      articles.push({
        title: title.replace(/\s+/g, " ").trim(),
        url: ensureLang(fullUrl, useLang),
        description,
      });
    }
  });

  const result: CategoryPage = { title: pageTitle, url, articles };
  setCached(`browse:${url}`, result);
  return result;
}

function ensureLang(url: string, lang: string = DEFAULT_LANG): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("lang")) {
      parsed.searchParams.set("lang", lang);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
