using 'main.bicep'

param appName = 'nextjs-oneagent-demo2'
param location = 'westeurope'
param skuName = 'S1'
param nodeVersion = 'NODE|24-lts'

// Fill these in with your Dynatrace environment details, or pass them at
// deploy time with --parameters (do not commit real secrets to source control).
param dtConnectionPoint = 'https://vot11022.live.dynatrace.com/communication'
param dtTenant = 'vot11022'
param dtTenantToken = '<tenant-token-returned-by-connectioninfo>'
// Dynatrace does not publish a latest tag. Pin a version verified in Docker Hub.
param dtCodeModulesImage = 'dynatrace/dynatrace-codemodules:1.343'
// First deployment: leave false, deploy the app zip, then redeploy with
// enableDynatraceSidecar=true so OneAgent's initial copy is not interrupted.
param enableDynatraceSidecar = false
