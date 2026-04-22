// containerEnv.bicep — Container Apps Environment with Log Analytics wired up.
// VNet-integrated so it can reach the private-endpoint Postgres.

param prefix string
param environment string
param location string
param tags object
param infrastructureSubnetId string

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-${environment}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-${environment}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

output id string = env.id
output name string = env.name
