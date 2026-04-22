/**
 * fetch.ts — Fetch and parse article content from churchofjesuschrist.org.
 *
 * Returns clean markdown extracted from the article body, stripping nav,
 * headers, footers, and decorative images. Results are cached in-process.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { DEFAULT_LANG } from "../lib/locale.js";
import { getCached, setCached } from "../lib/articleCache.js";
import { logger } from "../lib/logger.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Strip footnote reference anchors but preserve their text content.
// Gospel Library wraps footnoted scripture words in <a class="study-note-ref">,
// so returning "" here would silently delete those words from the output.
turndown.addRule("footnoteAnchors", {
  filter: (node) => {
    if (node.nodeName !== "A") return false;
    const el = node as unknown as { getAttribute?: (attr: string) => string | null };
    return el.getAttribute?.("class")?.includes("note-ref") === true;
  },
  replacement: (content) => content.trim(),
});

const HTTP_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (compatible; GospelLibraryMCPServer/1.0)",
};

export interface ArticleContent {
  title: string;
  author?: string;
  url: string;
  content: string;
}

/**
 * Fetch an article and return its content as markdown. Cached in-process.
 */
export async function getArticle(inputUrl: string, lang?: string): Promise<ArticleContent> {
  const url = ensureLang(inputUrl, lang);

  const cached = getCached<ArticleContent>(`article:${url}`);
  if (cached) {
    logger.debug({ url }, "Article cache hit");
    return cached;
  }

  const response = await fetch(url, { headers: HTTP_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  const author =
    $(".author-name").first().text().trim() ||
    $("[class*='author']").first().text().trim() ||
    undefined;

  // Remove inline footnote marker superscripts (small "a", "b", "c" letters).
  $("a[class*='note-ref'] sup").remove();

  // Remove non-content elements
  $(
    "header, footer, nav, .nav, .header, .footer, script, style, " +
      ".lc-header, .lc-footer, .lc-nav, " +
      "[class*='navigation'], [class*='breadcrumb'], [class*='sidebar'], " +
      "[class*='related'], [class*='share'], [class*='social'], " +
      "[class*='cookie'], [class*='banner'], " +
      "figure img, picture"
  ).remove();

  const contentSelectors = [
    "article",
    "[class*='body-block']",
    "[class*='article-content']",
    ".study-content",
    "main",
    "#content",
    ".content",
  ];

  let contentHtml = "";
  for (const selector of contentSelectors) {
    const el = $(selector).first();
    if (el.length && el.text().trim().length > 100) {
      contentHtml = el.html() || "";
      break;
    }
  }

  if (!contentHtml) {
    contentHtml = $("body").html() || "";
  }

  const content = turndown.turndown(contentHtml).trim();

  const article: ArticleContent = { title, author: author || undefined, url, content };
  setCached(`article:${url}`, article);
  return article;
}

function ensureLang(url: string, override?: string): string {
  try {
    const parsed = new URL(url);
    if (override) {
      parsed.searchParams.set("lang", override);
    } else if (!parsed.searchParams.has("lang")) {
      parsed.searchParams.set("lang", DEFAULT_LANG);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Fetch a scripture passage and return only the requested verse(s) as markdown.
 *
 * Looks up verse elements by their `#p{N}` IDs in the Gospel Library HTML.
 * If verseStart is provided, only verses verseStart..verseEnd are returned.
 * Falls back to the full article if the verse IDs are not found on the page.
 */
export async function getArticleVerses(
  inputUrl: string,
  verseStart?: number,
  verseEnd?: number
): Promise<ArticleContent> {
  const url = ensureLang(inputUrl);

  const response = await fetch(url, { headers: HTTP_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  $("a[class*='note-ref'] sup").remove();

  if (verseStart !== undefined) {
    const end = verseEnd ?? verseStart;
    const parts: string[] = [];

    for (let v = verseStart; v <= end; v++) {
      const el = $(`#p${v}`);
      if (el.length) {
        parts.push(turndown.turndown($.html(el) ?? "").trim());
      }
    }

    if (parts.length > 0) {
      return { title, url, content: parts.join("\n\n") };
    }
    // Verse IDs not found on this page — fall through to full chapter.
  }

  return getArticle(url);
}
