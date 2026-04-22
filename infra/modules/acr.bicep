// acr.bicep — Azure Container Registry (Basic) with AcrPull role assigned to
// the User-Assigned Managed Identity used by Container Apps.

param prefix string
param environment string
param location string
param tags object
param identityPrincipalId string

var acrName = toLower(replace('${prefix}${environment}acr', '-', ''))

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identityPrincipalId, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output loginServer string = acr.properties.loginServer
output id string = acr.id
output name string = acr.name
