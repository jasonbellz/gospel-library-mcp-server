# Client configuration

## Copilot CLI / Claude Desktop (MCP Streamable HTTP)

Most MCP clients accept an HTTP server URL and a custom header. Example
config fragment (exact schema varies by client):

```json
{
  "mcpServers": {
    "gospel-library": {
      "url": "https://glmcp-prod-app.<region>.azurecontainerapps.io/mcp",
      "headers": {
        "X-API-Key": "gl_YOUR_KEY_HERE"
      }
    }
  }
}
```

For Copilot CLI, when HTTP MCP is supported natively, the config lives in
your MCP settings file. Until then, the local stdio package
`@jasonbellz/gospel-library-mcp` provides the same tools without a key.

## Raw HTTP test

```bash
URL="https://glmcp-prod-app.<region>.azurecontainerapps.io/mcp"
KEY="gl_..."

# List tools
curl -N "$URL" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -N "$URL" \
  -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{"name":"get_scripture","arguments":{"reference":"Moroni 10:4-5"}}
  }'
```

## Rate limits

Default per-key limit is **60 requests/minute** and **10 000/month**. Contact
the admin for higher limits (adjusted via the `api_keys` table).
