# Deployment

## One-time bootstrap

1. **Create the Azure resources for GitHub OIDC**:

   Bash/macOS/Linux:
   ```bash
   ./scripts/bootstrap-azure.sh
   ```

   PowerShell (Windows):
   ```powershell
   ./scripts/bootstrap-azure.ps1
   ```

   Follow the final instructions to set the GitHub secrets and variables.

2. **Deploy the infrastructure** (subscription-scoped):
   ```bash
   az deployment sub create \
     --location eastus2 \
     --template-file infra/main.bicep \
     --parameters infra/parameters/prod.bicepparam \
     --parameters adminPrincipalId=<your-entra-oid> \
                  adminPrincipalName=<your-upn>
   ```
   Add yourself as an Entra admin on Postgres so you can run admin scripts.

3. **Apply the database schema** — from a machine with network access to
   Postgres (or via the Container App):
   ```bash
   export POSTGRES_HOST=<fqdn from bicep output>
   export POSTGRES_USER=<your UPN>
   export AZURE_OPENAI_ENDPOINT=<ignored for schema but required by config>
   az login
   npm run schema:apply
   ```

4. **Issue the first API key**:
   ```bash
   npm run key:issue -- --label "initial"
   ```

## Ongoing deployments

Push a git tag `vX.Y.Z` → `docker-publish.yml` builds the image and pushes to
ACR → merge to `main` (or manually dispatch `deploy.yml`) → Bicep deploys.

## Initial index population

After first deploy, trigger the reindex job:

```bash
az containerapp job start \
  --name glmcp-prod-reindex \
  --resource-group glmcp-prod-rg
```

Or use the `Reindex Trigger` workflow in GitHub Actions. The first run fetches
the entire corpus (~1 hour).

## Scaling beyond one replica

If you exceed ~20 concurrent requests regularly:

- Increase `maxReplicas` in `containerApp.bicep`.
- API-key rate-limit counters become per-replica — consider moving `@fastify/rate-limit`
  to a Postgres-backed store (there is a community plugin), or add Redis.
