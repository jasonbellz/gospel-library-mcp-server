// main.bicep — Subscription-scoped deployment for the Gospel Library MCP server.
//
// Creates a resource group and all resources needed to run the HTTP MCP
// server on Azure Container Apps, backed by PostgreSQL Flexible Server with
// pgvector and Azure OpenAI for embeddings. Managed Identity is used for all
// Azure-to-Azure authentication — no Key Vault required.

targetScope = 'subscription'

@description('Short prefix used to name all resources (e.g., glmcp).')
param prefix string = 'glmcp'

@description('Environment suffix (dev, prod).')
@allowed([ 'dev', 'prod' ])
param environment string = 'prod'

@description('Azure region for all resources.')
param location string = 'eastus2'

@description('Container image tag to deploy.')
param imageTag string = 'latest'

@description('Object ID of the human user who should be a Postgres Entra admin (optional, leave blank to skip).')
param adminPrincipalId string = ''

@description('Entra principal name (UPN or object display name) of the human admin (required if adminPrincipalId is set).')
param adminPrincipalName string = ''

var rgName = '${prefix}-${environment}-rg'
var tags = {
  project: 'gospel-library-mcp'
  environment: environment
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: rgName
  location: location
  tags: tags
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
  }
}

module network 'modules/network.bicep' = {
  name: 'network'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module openai 'modules/openai.bicep' = {
  name: 'openai'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    identityPrincipalId: identity.outputs.principalId
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    delegatedSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.postgresPrivateDnsZoneId
    identityPrincipalId: identity.outputs.principalId
    identityPrincipalName: identity.outputs.principalName
    adminPrincipalId: adminPrincipalId
    adminPrincipalName: adminPrincipalName
  }
}

module containerEnv 'modules/containerEnv.bicep' = {
  name: 'containerEnv'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    infrastructureSubnetId: network.outputs.containerAppsSubnetId
  }
}

module containerApp 'modules/containerApp.bicep' = {
  name: 'containerApp'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    containerEnvId: containerEnv.outputs.id
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    acrLoginServer: acr.outputs.loginServer
    imageTag: imageTag
    postgresFqdn: postgres.outputs.fqdn
    postgresUser: identity.outputs.principalName
    azureOpenAiEndpoint: openai.outputs.endpoint
    azureOpenAiDeployment: openai.outputs.deploymentName
  }
}

module reindexJob 'modules/reindexJob.bicep' = {
  name: 'reindexJob'
  scope: rg
  params: {
    prefix: prefix
    environment: environment
    location: location
    tags: tags
    containerEnvId: containerEnv.outputs.id
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    acrLoginServer: acr.outputs.loginServer
    imageTag: imageTag
    postgresFqdn: postgres.outputs.fqdn
    postgresUser: identity.outputs.principalName
    azureOpenAiEndpoint: openai.outputs.endpoint
    azureOpenAiDeployment: openai.outputs.deploymentName
  }
}

output resourceGroupName string = rg.name
output containerAppFqdn string = containerApp.outputs.fqdn
output acrLoginServer string = acr.outputs.loginServer
output postgresFqdn string = postgres.outputs.fqdn
output identityClientId string = identity.outputs.clientId
