<#
.SYNOPSIS
  Builds the Next.js app (standalone output) and zip-deploys it to an existing
  Azure App Service Linux web app.

.DESCRIPTION
  1. npm ci && npm run build (produces .next/standalone/server.js plus static
     assets, copied in via scripts/copy-standalone-assets.mjs's postbuild hook).
  2. Zips the contents of .next/standalone so that server.js sits at the zip root.
  3. Deploys the zip with `az webapp deploy` (zip deployment, no Docker involved).

.PARAMETER ResourceGroup
  Name of the resource group containing the web app.

.PARAMETER AppName
  Name of the Azure App Service (Microsoft.Web/sites) to deploy to.

.EXAMPLE
  ./deploy.ps1 -ResourceGroup rg-nextjs-oneagent -AppName nextjs-oneagent-demo
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroup,

  [Parameter(Mandatory = $true)]
  [string]$AppName
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  npm ci
  if (-not $?) { throw "npm ci failed" }

  Write-Host "Building Next.js app (standalone output)..." -ForegroundColor Cyan
  npm run build
  if (-not $?) { throw "npm run build failed" }

  $standaloneDir = Join-Path $repoRoot ".next\standalone"
  if (-not (Test-Path $standaloneDir)) {
    throw "Build output not found at $standaloneDir. Check next.config.js has output: 'standalone'."
  }

  $zipPath = Join-Path $repoRoot "deploy.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

  Write-Host "Zipping standalone build output..." -ForegroundColor Cyan
  Compress-Archive -Path (Join-Path $standaloneDir "*") -DestinationPath $zipPath -Force

  Write-Host "Deploying zip to App Service '$AppName' in resource group '$ResourceGroup'..." -ForegroundColor Cyan
  az webapp deploy `
    --resource-group $ResourceGroup `
    --name $AppName `
    --src-path $zipPath `
    --type zip

  Write-Host "Deployment complete. Restart the app if you also just changed sidecar/app settings:" -ForegroundColor Green
  Write-Host "  az webapp restart --resource-group $ResourceGroup --name $AppName" -ForegroundColor Green
}
finally {
  Pop-Location
}
