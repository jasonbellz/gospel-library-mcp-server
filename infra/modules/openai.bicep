// openai.bicep — Azure OpenAI account with a text-embedding-3-small
// deployment and the Cognitive Services OpenAI User role granted to the MI.

param prefix string
param environment string
param location string
param tags object
param identityPrincipalId string

var accountName = '${prefix}-${environment}-openai'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: 'text-embedding-3-small'
  sku: {
    name: 'Standard'
    capacity: 50
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-small'
      version: '1'
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// Cognitive Services OpenAI User — allows data plane access for completions/embeddings.
var cognitiveOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource openAiUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, identityPrincipalId, cognitiveOpenAiUserRoleId)
  scope: account
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveOpenAiUserRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output endpoint string = account.properties.endpoint
output deploymentName string = embeddingDeployment.name
output accountName string = account.name
