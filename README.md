# Gospel Library MCP Server

> ⚠️ **Status:** Early development (v0.1.1). Not yet deployed.

HTTP-hosted [Model Context Protocol](https://modelcontextprotocol.io/) server providing structured access to the
[Church of Jesus Christ Gospel Library](https://www.churchofjesuschrist.org/study/) — scriptures,
General Conference talks, the General Handbook, Gospel Topics essays, and Come Follow Me manuals.

This is the **hosted/HTTP** counterpart to [`@jasonbellz/gospel-library-mcp`](https://github.com/jasonbellz/gospel-library-mcp),
which runs locally over stdio. Both projects expose the same 4 tools.

## Architecture

- **Compute:** Azure Container Apps (scale-to-zero)
- **Vector store:** PostgreSQL Flexible Server (Burstable B1ms) + `pgvector`
- **Embeddings:** Azure OpenAI `text-embedding-3-small`
- **Auth:** API keys in Postgres (sha256-hashed); Managed Identity for all Azure-to-Azure auth

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Tools

| Tool | Purpose |
|------|---------|
| `search_gospel_library` | Semantic search across all indexed content |
| `get_article` | Fetch full content of an article/talk by URL |
| `browse_category` | List articles in a category (e.g. a conference session) |
| `get_scripture` | Fetch a specific verse or passage |

## Quick Links

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Local Development](docs/LOCAL-DEV.md)
- [Client Configuration](docs/CLIENT-CONFIG.md)
- [Disclaimer](DISCLAIMER.md)

## License

MIT — see [LICENSE](LICENSE).

This is an unofficial project. See [DISCLAIMER.md](DISCLAIMER.md).
