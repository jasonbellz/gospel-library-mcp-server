#!/usr/bin/env bash
# bootstrap-azure.sh — One-time setup for GitHub Actions OIDC federation.
#
# Creates an Entra app registration + service principal with federated
# credentials trusting this repository, and assigns Contributor + User Access
# Administrator at the subscription scope.
#
# Prereqs:
#   - az CLI logged in as a tenant admin / subscription owner
#   - GitHub CLI (gh) logged in
#   - Run from the repo root
#
# Outputs the three values to set as repository secrets:
#   AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID

set -euo pipefail

APP_NAME="${APP_NAME:-gospel-library-mcp-deployer}"
REPO="${REPO:-jasonbellz/gospel-library-mcp-server}"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Creating app registration: $APP_NAME"
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)

echo "Creating service principal"
az ad sp create --id "$APP_ID" >/dev/null

echo "Assigning Contributor on subscription $SUBSCRIPTION_ID"
az role assignment create \
  --role Contributor \
  --assignee "$APP_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" >/dev/null

echo "Assigning User Access Administrator on subscription (needed for MI role assignments)"
az role assignment create \
  --role "User Access Administrator" \
  --assignee "$APP_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID" >/dev/null

echo "Creating federated credential for main branch"
cat <<EOF > /tmp/fc-main.json
{
  "name": "main-branch",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:$REPO:ref:refs/heads/main",
  "audiences": [ "api://AzureADTokenExchange" ]
}
EOF
az ad app federated-credential create --id "$APP_ID" --parameters /tmp/fc-main.json

echo "Creating federated credential for prod environment"
cat <<EOF > /tmp/fc-env.json
{
  "name": "prod-environment",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:$REPO:environment:prod",
  "audiences": [ "api://AzureADTokenExchange" ]
}
EOF
az ad app federated-credential create --id "$APP_ID" --parameters /tmp/fc-env.json

echo ""
echo "✅ Done. Set these as GitHub repository secrets:"
echo ""
echo "  AZURE_CLIENT_ID=$APP_ID"
echo "  AZURE_TENANT_ID=$TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
echo ""
echo "And as repository variables:"
echo "  ACR_NAME=<your acr name, e.g. glmcpprodacr>"
echo "  RESOURCE_GROUP=glmcp-prod-rg"
echo "  REINDEX_JOB_NAME=glmcp-prod-reindex"
