// reindexJob.bicep — Container Apps Job that runs the weekly reindex.
// Shares the image with the main app but overrides the command.

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

@description('Cron expression — default: Sundays at 06:00 UTC.')
param cronExpression string = '0 6 * * 0'

var jobName = '${prefix}-${environment}-reindex'
var image = '${acrLoginServer}/gospel-library-mcp-server:${imageTag}'

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
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
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 14400
      replicaRetryLimit: 1
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
          name: 'reindex'
          image: image
          command: [ 'node', 'dist/index.js' ]
          args: [ 'reindex' ]
          resources: {
            cpu: json('2.0')
            memory: '4.0Gi'
          }
          env: [
            { name: 'MODE', value: 'reindex' }
            { name: 'LOG_LEVEL', value: 'info' }
            { name: 'POSTGRES_HOST', value: postgresFqdn }
            { name: 'POSTGRES_DB', value: 'gospel' }
            { name: 'POSTGRES_USER', value: postgresUser }
            { name: 'POSTGRES_SSL', value: 'true' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
          ]
        }
      ]
    }
  }
}

output name string = job.name
