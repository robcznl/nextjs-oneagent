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

echo Deployment complete. If you also just changed app settings ^(OTEL_* variables^), restart the app:
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
