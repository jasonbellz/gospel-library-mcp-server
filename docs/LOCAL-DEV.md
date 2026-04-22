# Local development

This project targets Node 20+.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Azure OpenAI endpoint and Postgres details
```

## Running against a local Postgres

Start a pgvector-enabled Postgres:

```bash
docker run --rm -d --name glmcp-pg \
  -e POSTGRES_PASSWORD=local \
  -e POSTGRES_USER=local \
  -e POSTGRES_DB=gospel \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Point `.env` at it (note: local dev uses password auth, not Entra):

```
POSTGRES_HOST=localhost
POSTGRES_USER=local
POSTGRES_DB=gospel
POSTGRES_SSL=false
```

> **Note:** The provided `pgClient.ts` authenticates via Entra only.
> For a local password connection, set `PGPASSWORD=local` and tweak
> `pgClient.ts` to skip the token provider when `POSTGRES_SSL=false`.

## Azure OpenAI

For embeddings, you need a real Azure OpenAI endpoint. Run `az login` and the
`DefaultAzureCredential` flow will pick up your user creds.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with tsx watch |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run reindex` | Run the reindex job once |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run schema:apply` | Apply `infra/schema.sql` |
| `npm run key:issue -- --label NAME` | Issue an API key |
| `npm run key:list` | List all keys + usage |
| `npm run key:revoke -- --id NAME` | Revoke a key |

## Testing the HTTP endpoint

```bash
curl -N -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: gl_..." \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
