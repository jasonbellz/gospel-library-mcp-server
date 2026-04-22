// network.bicep — VNet with delegated subnets for Container Apps + Postgres,
// plus the private DNS zone used to resolve the Postgres Flexible Server FQDN
// from inside the VNet.

param prefix string
param environment string
param location string
param tags object

var vnetName = '${prefix}-${environment}-vnet'
var privateDnsZoneName = 'privatelink.postgres.database.azure.com'

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [ '10.40.0.0/16' ]
    }
    subnets: [
      {
        name: 'containerapps-subnet'
        properties: {
          addressPrefix: '10.40.0.0/23'
          delegations: [
            {
              name: 'ca-delegation'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: 'postgres-subnet'
        properties: {
          addressPrefix: '10.40.2.0/24'
          delegations: [
            {
              name: 'pg-delegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
    ]
  }
}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: privateDnsZoneName
  location: 'global'
  tags: tags
}

resource privateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDnsZone
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

output vnetId string = vnet.id
output containerAppsSubnetId string = '${vnet.id}/subnets/containerapps-subnet'
output postgresSubnetId string = '${vnet.id}/subnets/postgres-subnet'
output postgresPrivateDnsZoneId string = privateDnsZone.id
