using 'main.bicep'

param appName = 'nextjs-oneagent-demo2'
param location = 'westeurope'
param skuName = 'S1'
param nodeVersion = 'NODE|24-lts'

// Fill these in with your Dynatrace environment details, or pass them at
// deploy time with --parameters (do not commit real secrets to source control).
// No trailing slash: the exporter appends /v1/traces.
param dtOtlpEndpoint = 'https://vot11022.live.dynatrace.com/api/v2/otlp'
// Access token with the openTelemetryTrace.ingest scope.
param dtApiToken = '<dynatrace-access-token-with-openTelemetryTrace.ingest>'
// Shown as the service name in Dynatrace; defaults to appName when omitted.
param otelServiceName = 'nextjs-oneagent-demo'
