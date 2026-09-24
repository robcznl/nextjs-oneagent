@echo off
setlocal

rem Builds the Next.js standalone app and zip-deploys it to an existing
rem Azure App Service Linux web app without requiring PowerShell script execution.

if "%~1"=="" goto usage
if "%~2"=="" goto usage

set "RESOURCE_GROUP=%~1"
set "APP_NAME=%~2"

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"

pushd "%REPO_ROOT%" || exit /b 1

set "SIDECAR_IMAGE="
for /f "usebackq delims=" %%I in (`az resource show --resource-group "%RESOURCE_GROUP%" --resource-type "Microsoft.Web/sites/sitecontainers" --name "%APP_NAME%/dynatrace-oneagent" --api-version "2024-04-01" --query "properties.image" --output tsv 2^>nul`) do set "SIDECAR_IMAGE=%%I"

if /I "%SIDECAR_IMAGE%"=="dynatrace/dynatrace-codemodules:latest" (
  echo ERROR: Azure still has the nonexistent Dynatrace sidecar image:
  echo   %SIDECAR_IMAGE%
  echo.
  echo Apply infra\main.bicep before running this zip deployment:
  echo   az deployment group create --resource-group "%RESOURCE_GROUP%" --template-file infra\main.bicep --parameters infra\main.bicepparam --parameters dtTenantToken="YOUR_TENANT_TOKEN"
  goto failed
)

if defined SIDECAR_IMAGE echo Live Dynatrace sidecar image: %SIDECAR_IMAGE%

echo Installing dependencies...
call npm ci
if errorlevel 1 goto failed

echo Building Next.js app ^(standalone output^)...
call npm run build
if errorlevel 1 goto failed

set "STANDALONE_DIR=%REPO_ROOT%\.next\standalone"
if not exist "%STANDALONE_DIR%\server.js" (
  echo Build output not found at "%STANDALONE_DIR%\server.js".
  echo Check that next.config.js has output: 'standalone'.
  goto failed
)

set "ZIP_PATH=%REPO_ROOT%\deploy.zip"
if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

echo Zipping standalone build output...
tar -a -c -f "%ZIP_PATH%" -C "%STANDALONE_DIR%" .
if errorlevel 1 goto failed

echo Deploying zip to App Service "%APP_NAME%" in resource group "%RESOURCE_GROUP%"...
call az webapp deploy --resource-group "%RESOURCE_GROUP%" --name "%APP_NAME%" --src-path "%ZIP_PATH%" --type zip
if errorlevel 1 goto failed

echo Deployment complete. If you also just changed sidecar or app settings, restart the app:
echo   az webapp restart --resource-group "%RESOURCE_GROUP%" --name "%APP_NAME%"

popd
endlocal
exit /b 0

:usage
echo Usage:
echo   infra\deploy.cmd ^<resource-group^> ^<app-name^>
echo.
echo Example:
echo   infra\deploy.cmd rg-nextjs-oneagent nextjs-oneagent-demo
exit /b 2

:failed
echo Deployment failed.
popd
endlocal
exit /b 1
