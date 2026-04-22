# bootstrap-azure.ps1 — One-time setup for GitHub Actions OIDC federation.
#
# Creates an Entra app registration + service principal with federated
# credentials trusting this repository, and assigns Contributor + User Access
# Administrator at the subscription scope.
#
# Prereqs:
#   - az CLI logged in as a tenant admin / subscription owner
#   - Run from the repo root in PowerShell 7+
#
# Outputs the three values to set as repository secrets:
#   AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID

[CmdletBinding()]
param(
    [string]$AppName = 'gospel-library-mcp-deployer',
    [string]$Repo = 'jasonbellz/gospel-library-mcp-server'
)

$ErrorActionPreference = 'Stop'

$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv

Write-Host "Creating app registration: $AppName"
$appId = az ad app create --display-name $AppName --query appId -o tsv

Write-Host "Creating service principal"
az ad sp create --id $appId | Out-Null

Write-Host "Assigning Contributor on subscription $subscriptionId"
az role assignment create `
    --role Contributor `
    --assignee $appId `
    --scope "/subscriptions/$subscriptionId" | Out-Null

Write-Host "Assigning User Access Administrator on subscription (needed for MI role assignments)"
az role assignment create `
    --role 'User Access Administrator' `
    --assignee $appId `
    --scope "/subscriptions/$subscriptionId" | Out-Null

$tempDir = [System.IO.Path]::GetTempPath()

Write-Host "Creating federated credential for main branch"
$fcMain = @{
    name      = 'main-branch'
    issuer    = 'https://token.actions.githubusercontent.com'
    subject   = "repo:${Repo}:ref:refs/heads/main"
    audiences = @('api://AzureADTokenExchange')
} | ConvertTo-Json -Compress
$fcMainPath = Join-Path $tempDir 'fc-main.json'
$fcMain | Set-Content -Path $fcMainPath -Encoding utf8
az ad app federated-credential create --id $appId --parameters "@$fcMainPath" | Out-Null

Write-Host "Creating federated credential for prod environment"
$fcEnv = @{
    name      = 'prod-environment'
    issuer    = 'https://token.actions.githubusercontent.com'
    subject   = "repo:${Repo}:environment:prod"
    audiences = @('api://AzureADTokenExchange')
} | ConvertTo-Json -Compress
$fcEnvPath = Join-Path $tempDir 'fc-env.json'
$fcEnv | Set-Content -Path $fcEnvPath -Encoding utf8
az ad app federated-credential create --id $appId --parameters "@$fcEnvPath" | Out-Null

Remove-Item -Path $fcMainPath, $fcEnvPath -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '✅ Done. Set these as GitHub repository secrets:'
Write-Host ''
Write-Host "  AZURE_CLIENT_ID=$appId"
Write-Host "  AZURE_TENANT_ID=$tenantId"
Write-Host "  AZURE_SUBSCRIPTION_ID=$subscriptionId"
Write-Host ''
Write-Host 'And as repository variables:'
Write-Host '  ACR_NAME=<your acr name, e.g. glmcpprodacr>'
Write-Host '  RESOURCE_GROUP=glmcp-prod-rg'
Write-Host '  REINDEX_JOB_NAME=glmcp-prod-reindex'
