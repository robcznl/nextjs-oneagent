// Provisions an Azure App Service (Linux, code-based/zip-deploy Node.js app)
// for a Next.js app that exports OpenTelemetry traces directly to Dynatrace.
//
// There is no OneAgent, sidecar container or LD_PRELOAD involved. Next.js'
// native `instrumentation.ts` hook registers the OpenTelemetry SDK
// (@vercel/otel) and the OTLP exporter is configured purely through the
// standard OTEL_* environment variables set as app settings below.
//
// References:
// https://nextjs.org/docs/app/guides/open-telemetry
// https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api
//
// NOTE: The web app is NOT a container. It's deployed with a regular zip deploy
// (Oryx-free, pre-built Next.js "standalone" output) using the built-in
// Node.js runtime (linuxFxVersion).

@description('Base name used to derive resource names (must be globally unique for the web app).')
param appName string = 'nextjs-oneagent-${uniqueString(resourceGroup().id)}'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('App Service Plan SKU name. Basic (B1) or higher is required for alwaysOn.')
@allowed([
  'B1'
  'B2'
  'B3'
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

@description('Dynatrace OTLP base endpoint without a trailing slash, e.g. https://<environment-id>.live.dynatrace.com/api/v2/otlp (SaaS) or https://<activegate>:9999/e/<environment-id>/api/v2/otlp (ActiveGate). The exporter appends /v1/traces.')
param dtOtlpEndpoint string

@description('Dynatrace access token with the openTelemetryTrace.ingest scope. Sent as "Authorization: Api-Token <token>".')
@secure()
param dtApiToken string

@description('OpenTelemetry service.name reported to Dynatrace. Defaults to the web app name.')
param otelServiceName string = appName

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
      appCommandLine: 'node server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false' // the Next.js "standalone" build artifact is already built before zip deploy
        }
        {
          name: 'OTEL_SERVICE_NAME'
          value: otelServiceName
        }
        {
          name: 'OTEL_EXPORTER_OTLP_ENDPOINT'
          value: dtOtlpEndpoint
        }
        {
          name: 'OTEL_EXPORTER_OTLP_PROTOCOL'
          value: 'http/protobuf' // Dynatrace accepts OTLP/HTTP protobuf only (no JSON, no gRPC)
        }
        {
          name: 'OTEL_EXPORTER_OTLP_HEADERS'
          value: 'Authorization=Api-Token ${dtApiToken}'
        }
      ]
    }
  }
}

output appServiceName string = appService.name
output appServiceDefaultHostName string = appService.properties.defaultHostName
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
