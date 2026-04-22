// postgres.bicep — PostgreSQL Flexible Server B1ms with pgvector and
// Entra-only authentication. The Container App's MI is designated as an
// Entra admin; optionally a human admin (adminPrincipalId) is also added.

param prefix string
param environment string
param location string
param tags object
param delegatedSubnetId string
param privateDnsZoneId string
param identityPrincipalId string
param identityPrincipalName string

@description('Optional Entra object ID for a human admin. Leave blank to skip.')
param adminPrincipalId string = ''

@description('Entra display name (UPN) for the human admin.')
param adminPrincipalName string = ''

var serverName = '${prefix}-${environment}-pg'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: subscription().tenantId
    }
  }
}

// Required: allow the pgvector extension to be loaded.
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// MI admin — the Container App identity. Principal type must be 'ServicePrincipal'.
resource identityAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: server
  name: identityPrincipalId
  properties: {
    principalName: identityPrincipalName
    principalType: 'ServicePrincipal'
    tenantId: subscription().tenantId
  }
}

// Optional human admin.
resource humanAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = if (!empty(adminPrincipalId)) {
  parent: server
  name: adminPrincipalId
  properties: {
    principalName: adminPrincipalName
    principalType: 'User'
    tenantId: subscription().tenantId
  }
  dependsOn: [ identityAdmin ]
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'gospel'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output name string = server.name
