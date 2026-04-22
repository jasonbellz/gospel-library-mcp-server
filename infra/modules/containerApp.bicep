// containerApp.bicep — The MCP HTTP server on Azure Container Apps.
// Scales to zero, public HTTPS ingress on port 3000, User-Assigned MI attached.

param prefix string
param environment string
param location string
param tags object
param containerEnvId string
param identityId string
param identityClientId string
param acrLoginServer string
param imageTag string
param postgresFqdn string
param postgresUser string
param azureOpenAiEndpoint string
param azureOpenAiDeployment string

var appName = '${prefix}-${environment}-app'
var image = '${acrLoginServer}/gospel-library-mcp-server:${imageTag}'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: containerEnvId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'mcp'
          image: image
          command: [ 'node', 'dist/index.js' ]
          args: [ 'server' ]
          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
          env: [
            { name: 'MODE', value: 'server' }
            { name: 'PORT', value: '3000' }
            { name: 'LOG_LEVEL', value: 'info' }
            { name: 'POSTGRES_HOST', value: postgresFqdn }
            { name: 'POSTGRES_DB', value: 'gospel' }
            { name: 'POSTGRES_USER', value: postgresUser }
            { name: 'POSTGRES_SSL', value: 'true' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3000 }
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/ready', port: 3000 }
              periodSeconds: 10
              initialDelaySeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: { concurrentRequests: '20' }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output name string = app.name
