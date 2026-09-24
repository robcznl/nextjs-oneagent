// Provisions an Azure App Service (Linux, code-based/zip-deploy Node.js app)
// with the Dynatrace OneAgent injected via a sidecar container
// (dynatrace/dynatrace-codemodules bootstrapper) using LD_PRELOAD.
//
// Reference:
// https://docs.dynatrace.com/docs/ingest-from/microsoft-azure-services/integrations/azure-appservice/integrate-oneagent-on-web-app-for-containers
//
// NOTE: The web app itself is NOT a container. It's deployed with a regular
// zip deploy (Oryx-free, pre-built Next.js "standalone" output) using the
// built-in Node.js runtime (linuxFxVersion). Sidecar containers are supported
// alongside code-based Linux apps starting at the Standard (S1) plan tier.

@description('Base name used to derive resource names (must be globally unique for the web app).')
param appName string = 'nextjs-oneagent-${uniqueString(resourceGroup().id)}'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('App Service Plan SKU name. Sidecar containers require Standard (S1) or higher.')
@allowed([
  'S1'
  'S2'
  'S3'
  'P0v3'
  'P1v3'
  'P2v3'
  'P3v3'
])
param skuName string = 'S1'

@description('Node.js runtime stack version for the code-based web app.')
param nodeVersion string = 'NODE|24-lts'

@description('Dynatrace connection endpoint(s), e.g. https://<environment-id>.live.dynatrace.com/communication or your ActiveGate address(es).')
param dtConnectionPoint string

@description('Dynatrace environment (tenant) ID, e.g. abc12345.')
param dtTenant string

@description('Dynatrace tenant token returned by the Deployment API connectioninfo endpoint. This is not the PaaS/API token used to call that endpoint.')
@secure()
param dtTenantToken string

@description('Versioned Dynatrace CodeModules bootstrapper image from Docker Hub. The repository does not publish a latest tag.')
param dtCodeModulesImage string = 'dynatrace/dynatrace-codemodules:1.343'

@description('Name of the sidecar container resource.')
param sidecarName string = 'dynatrace-oneagent'

@description('Deploy the Dynatrace sidecar. Disable this for the initial infrastructure deployment, then enable it after the application zip is deployed.')
param enableDynatraceSidecar bool = true

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: skuName
  }
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: nodeVersion
      appCommandLine: 'node startup.mjs'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'true' // required so the bootstrapper can persist OneAgent to /home/dynatrace/oneagent
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false' // the Next.js "standalone" build artifact is already built before zip deploy
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '0' // must run from a writable filesystem so LD_PRELOAD/OneAgent files are reachable
        }
        {
          name: 'DT_CONNECTION_POINT'
          value: dtConnectionPoint
        }
        {
          name: 'DT_TENANT'
          value: dtTenant
        }
        {
          name: 'DT_TENANTTOKEN'
          value: dtTenantToken
        }
      ]
    }
  }
}

// Dynatrace OneAgent CodeModules bootstrapper, running as a sidecar container
// alongside the code-based main app. It writes OneAgent to shared persistent
// storage; startup.mjs then exports LD_PRELOAD only for the Node.js process
// after the library exists.
resource dynatraceSidecar 'Microsoft.Web/sites/sitecontainers@2024-04-01' = if (enableDynatraceSidecar) {
  parent: appService
  name: sidecarName
  properties: {
    image: dtCodeModulesImage
    isMain: false
    authType: 'Anonymous'
    startUpCommand: 'serverless --keep-alive --target /home/dynatrace/ --technology nodejs'
    environmentVariables: []
    volumeMounts: []
  }
}

output appServiceName string = appService.name
output appServiceDefaultHostName string = appService.properties.defaultHostName
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
