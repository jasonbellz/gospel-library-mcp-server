/**
 * server.ts — Fastify HTTP server hosting the MCP Streamable HTTP transport.
 *
 * Endpoints:
 *   POST /mcp     — JSON-RPC requests (with optional SSE streaming response)
 *   GET  /mcp     — server-initiated SSE stream (when supported by client)
 *   GET  /health  — liveness probe (no DB check)
 *   GET  /ready   — readiness probe (verifies Postgres reachable)
 *
 * Authentication: every /mcp request must carry a valid `X-API-Key` header.
 * Rate limiting:
 *   - Per-IP global (pre-auth)  — light DOS protection
 *   - Per-key (post-auth)        — fairness across users
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { closePool, getPool } from "./lib/pgClient.js";
import { validateKey, recordUsage, type ApiKeyMetadata } from "./providers/apiKeyStore.js";
import { searchGospelLibrary } from "./tools/search.js";
import { getArticle } from "./tools/fetch.js";
import { browseCategory } from "./tools/browse.js";
import { getScripture } from "./tools/scripture.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyMetadata;
  }
}

// ── MCP server setup ────────────────────────────────────────────────────────

function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "gospel-library", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_gospel_library",
        description:
          "Search the Church of Jesus Christ Gospel Library for articles, talks, " +
          "scriptures, manuals, and policies. Returns matching articles with titles and URLs.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            category: {
              type: "string",
              description:
                "Optional category filter: 'general-conference', 'scriptures', 'manual', etc.",
            },
            maxResults: { type: "number", description: "Max results (default 5)" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_article",
        description:
          "Fetch the full content of a specific Gospel Library article, talk, or " +
          "manual chapter by URL. Returns clean markdown.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Full Gospel Library URL" },
            lang: { type: "string", description: "Optional language code" },
          },
          required: ["url"],
        },
      },
      {
        name: "browse_category",
        description:
          "List articles available in a Gospel Library category. Useful for browsing " +
          "conference sessions or manuals. Category paths must be exact.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Category path under /study/" },
            lang: { type: "string", description: "Optional language code" },
          },
          required: ["category"],
        },
      },
      {
        name: "get_scripture",
        description:
          "Fetch a specific scripture passage by reference. Examples: 'John 3:16', " +
          "'2 Nephi 2:25', 'D&C 76:22', 'Moses 1:39'.",
        inputSchema: {
          type: "object",
          properties: {
            reference: { type: "string", description: "Scripture reference" },
            lang: { type: "string", description: "Optional language code" },
          },
          required: ["reference"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "search_gospel_library": {
          const { query, category, maxResults } = args as {
            query: string;
            category?: string;
            maxResults?: number;
          };
          const results = await searchGospelLibrary(query, category, maxResults ?? 5);
          if (results.length === 0) {
            return { content: [{ type: "text", text: `No results found for "${query}".` }] };
          }
          const formatted = results
            .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
            .join("\n\n");
          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
              },
            ],
          };
        }

        case "get_article": {
          const { url, lang } = args as { url: string; lang?: string };
          const article = await getArticle(url, lang);
          const header = article.author
            ? `# ${article.title}\n*by ${article.author}*\n\n`
            : `# ${article.title}\n\n`;
          return { content: [{ type: "text", text: header + article.content }] };
        }

        case "browse_category": {
          const { category, lang } = args as { category: string; lang?: string };
          const page = await browseCategory(category, lang);
          if (page.notFound) {
            return {
              content: [
                { type: "text", text: page.suggestion ?? `Category "${category}" not found.` },
              ],
            };
          }
          if (page.articles.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No articles found in category "${category}". Try search_gospel_library instead.`,
                },
              ],
            };
          }
          const list = page.articles
            .slice(0, 50)
            .map((a, i) => {
              const desc = a.description ? `\n   ${a.description}` : "";
              return `${i + 1}. **${a.title}**\n   ${a.url}${desc}`;
            })
            .join("\n\n");
          return {
            content: [
              {
                type: "text",
                text:
                  `## ${page.title}\n\n${list}` +
                  (page.articles.length > 50
                    ? `\n\n_(showing 50 of ${page.articles.length} results)_`
                    : ""),
              },
            ],
          };
        }

        case "get_scripture": {
          const { reference, lang } = args as { reference: string; lang?: string };
          const result = await getScripture(reference, lang);
          return {
            content: [
              {
                type: "text",
                text: `# ${result.reference}\n\nSource: ${result.url}\n\n${result.content}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, tool: name }, "Tool execution failed");
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

// ── Auth middleware ─────────────────────────────────────────────────────────

async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawKey = request.headers["x-api-key"];
  if (typeof rawKey !== "string" || !rawKey) {
    reply.code(401).send({ error: "Missing X-API-Key header" });
    return;
  }
  try {
    const meta = await validateKey(rawKey);
    request.apiKey = meta;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    reply.code(401).send({ error: message });
  }
}

// ── Server build ────────────────────────────────────────────────────────────

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(rateLimit, {
    global: false,
    max: config.rateLimitPerIp,
    timeWindow: config.rateLimitWindow,
    keyGenerator: (req) => req.ip,
  });

  // Liveness — no DB check, just confirms the process is up.
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness — verifies Postgres is reachable.
  app.get("/ready", async (_req, reply) => {
    try {
      const pool = await getPool();
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch (err) {
      logger.error({ err }, "Readiness check failed");
      reply.code(503).send({ status: "not ready" });
      return reply;
    }
  });

  // ── MCP endpoint ──────────────────────────────────────────────────────────
  // Fresh transport per request — appropriate for stateless tool calls.
  app.post(
    "/mcp",
    {
      config: { rateLimit: { max: config.rateLimitPerIp, timeWindow: config.rateLimitWindow } },
      preHandler: authenticate,
    },
    async (request, reply) => {
      const meta = request.apiKey;
      if (!meta) {
        reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });
      const mcpServer = buildMcpServer();
      await mcpServer.connect(transport);

      reply.raw.on("close", () => {
        transport.close().catch(() => undefined);
      });

      // Hand the raw Node req/res to the transport.
      await transport.handleRequest(request.raw, reply.raw, request.body);

      // Fire-and-forget usage recording — don't fail the request on DB errors.
      recordUsage(meta.keyHash).catch((err) => logger.warn({ err }, "recordUsage failed"));
    }
  );

  app.get(
    "/mcp",
    { preHandler: authenticate },
    async (_request, reply) => {
      // Streamable HTTP supports an optional GET for server-initiated streams.
      // We don't currently emit unsolicited messages, so return 405.
      reply.code(405).send({ error: "Method not allowed" });
    }
  );

  return app;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info({ port: config.port }, "MCP HTTP server listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    try {
      await app.close();
      await closePool();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
