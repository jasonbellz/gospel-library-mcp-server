// identity.bicep — User-assigned Managed Identity used by the Container App
// and the Reindex Job for Postgres Entra auth, Azure OpenAI access, and ACR pull.

param prefix string
param environment string
param location string
param tags object

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-07-31-preview' = {
  name: '${prefix}-${environment}-id'
  location: location
  tags: tags
}

output id string = identity.id
output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
// Used as both the Postgres role name and the Entra admin display name.
output principalName string = identity.name
