# Architecture

The Gospel Library MCP HTTP server exposes 4 MCP tools (`search_gospel_library`,
`get_article`, `browse_category`, `get_scripture`) over the MCP **Streamable
HTTP** transport. It is intended to be deployed as a central Azure service.

```
  MCP client (Copilot CLI, mcp-inspector, …)
          │   HTTPS  + X-API-Key header
          ▼
  Azure Container Apps  (min 0, max 3 replicas, 1 vCPU / 2 GB)
  ├── Fastify + @modelcontextprotocol/sdk StreamableHTTPServerTransport
  ├── API-key auth (sha256, Postgres-backed, 60 s in-memory cache)
  ├── @fastify/rate-limit (per-IP, per-key)
  └── Pino structured logs → Log Analytics
          │
          ├─► Azure OpenAI (text-embedding-3-small, 1536 dims)
          ├─► PostgreSQL Flexible Server B1ms + pgvector (HNSW)
          └─► churchofjesuschrist.org (article fetch, 15 min LRU)

  Azure Container Apps Job
  └── Weekly cron: crawl sitemap → diff → embed → upsert
```

## Authentication

**Outbound (Azure → Azure):** Managed Identity only. No Key Vault.
- Postgres: Entra token refreshed by `pg`'s function-as-password mechanism.
- Azure OpenAI: `getBearerTokenProvider` from `@azure/identity`.
- ACR: `AcrPull` role granted to the User-Assigned MI.

**Inbound (client → server):** API keys.
- Prefix `gl_` + 32 random bytes (hex) — 67-char total.
- Raw key is **never** persisted; only its sha256 hash.
- Per-key rate limit (default 60/min) and monthly quota (default 10 000).
- Usage tracked in per-minute buckets in `api_key_usage`.

## Schema

See [`infra/schema.sql`](../infra/schema.sql).

## Why these choices

| Decision | Rationale |
|---|---|
| Container Apps Consumption | Scale-to-zero → ~$2/mo compute |
| Postgres + pgvector (not AI Search) | ~$25/mo vs ~$75/mo; HNSW is fast enough on ≤ 10k docs |
| No Key Vault | MI covers all Azure auth; API keys are Postgres-native |
| In-process LRU (not Redis) | Adequate for ≤ 3 replicas; re-evaluate when scaling out |
| Streamable HTTP (not SSE) | Current MCP spec — single endpoint for POST+GET |

## Cold start

With `minReplicas: 0`, first request after idle takes ~3–5 s. All subsequent
requests on that replica are fast. Acceptable for MCP tool calls.
