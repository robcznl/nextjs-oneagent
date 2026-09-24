# nextjs-oneagent

A sample Next.js app deployed to **Azure App Service (Linux)** via **zip deploy**
(no Docker/custom container for the app itself), with **Dynatrace OneAgent**
injected through a **sidecar container** for telemetry.

Reference: [Integrate OneAgent on Azure App Service for Linux and containers](https://docs.dynatrace.com/docs/ingest-from/microsoft-azure-services/integrations/azure-appservice/integrate-oneagent-on-web-app-for-containers)
(bootstrapper sidecar approach).

## How it works

- The **Next.js app** is built locally/in CI with `output: 'standalone'` and
  deployed as a plain zip package to the App Service's built-in Node.js
  runtime (`linuxFxVersion: NODE|20-lts`). There's no Docker image to build or
  push for the app itself.
- **Dynatrace OneAgent** is added as an [App Service sidecar container](https://learn.microsoft.com/en-us/azure/app-service/overview-sidecar)
  (`Microsoft.Web/sites/sitecontainers`, `isMain: false`) running the public
  `dynatrace/dynatrace-codemodules` bootstrapper image. It writes OneAgent to
  shared persistent storage (`/home/dynatrace/oneagent`). The App Service
  startup command runs [startup.mjs](startup.mjs), which checks whether the
  OneAgent library already exists and sets `LD_PRELOAD` only for the child
  Next.js server process. This avoids noisy `ld.so` preload errors during early
  platform startup, before the sidecar has finished installing OneAgent.
- Sidecar containers require the **Standard (S1) plan tier or higher**; Free/
  Shared/Basic tiers aren't supported.

```
┌───────────────────────────── App Service (Linux) ─────────────────────────────┐
│                                                                                 │
│  Main app (code-based, zip deploy)        Sidecar container (isMain: false)   │
│  ┌───────────────────────────────┐        ┌──────────────────────────────┐   │
│  │ node startup.mjs              │        │ dynatrace/dynatrace-         │   │
│  │ └─ node server.js + LD_PRELOAD│◄──────►│ codemodules bootstrapper     │   │
│  └───────────────────────────────┘  shared │ writes OneAgent to           │   │
│              ▲                     storage │ /home/dynatrace/oneagent     │   │
│              │                              └──────────────────────────────┘   │
│              └── shared app settings (DT_CONNECTION_POINT, DT_TENANT, ...) ────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Repo layout

```
nextjs-oneagent/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/health/route.ts     # surfaces LD_PRELOAD / OneAgent injection status
├── scripts/
│   └── copy-standalone-assets.mjs  # postbuild: copies public/ + .next/static into standalone output
├── startup.mjs                  # App Service bootstrapper; sets LD_PRELOAD for server.js when available
├── infra/
│   ├── main.bicep              # App Service Plan + Web App + Dynatrace sidecar
│   ├── main.bicepparam         # sample parameters (fill in your Dynatrace values)
│   ├── deploy.ps1              # PowerShell: build -> zip -> az webapp deploy
│   └── deploy.cmd              # Command Prompt alternative when PS scripts are blocked
├── next.config.js              # output: 'standalone'
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 20+
- Azure CLI (`az`), logged in (`az login`) with the Bicep extension (`az bicep install`)
- A Dynatrace tenant token (`DT_TENANTTOKEN`) and connection endpoints supplied
  by your Dynatrace administrator, **or** a PaaS/API token that can call the
  Deployment API to retrieve those values.

If you have a PaaS/API token, retrieve the OneAgent connection information as
follows. Do not use the PaaS/API token itself as `DT_TENANTTOKEN`:

```bash
curl -sS \
  -H "Authorization: Api-Token $PAAS_TOKEN" \
  "https://<environment-id>.live.dynatrace.com/api/v1/deployment/installer/agent/connectioninfo"
```

Use the response's `tenantToken` for `dtTenantToken` and an appropriate value
from `communicationEndpoints` for `dtConnectionPoint`. Both tokens are
secrets; don't commit or print them in logs.

## 1. Provision the App Service without the sidecar

Edit [infra/main.bicepparam](infra/main.bicepparam) with your app name, region, and Dynatrace
values (or pass them inline to avoid committing secrets). Leave
`enableDynatraceSidecar = false` for this initial deployment:

```powershell
az group create --name rg-nextjs-oneagent --location westeurope

az deployment group create `
  --resource-group rg-nextjs-oneagent `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam `
  --parameters dtTenantToken="<tenant-token-returned-by-connectioninfo>"
```

This initially creates:

- A **Standard (S1) Linux App Service Plan**
- A **Linux Web App** (`NODE|20-lts`, code-based/zip deploy, `appCommandLine: node startup.mjs`)
  with app settings for `WEBSITES_ENABLE_APP_SERVICE_STORAGE`, `DT_CONNECTION_POINT`,
  `DT_TENANT`, and `DT_TENANTTOKEN`

The sidecar is intentionally deferred until the application files exist.
Otherwise a failed main-app startup can terminate the sidecar while it is
copying OneAgent and leave a stale deployment lock in persistent storage.

## 2. Build and deploy the app zip

If PowerShell scripts are allowed:

```powershell
./infra/deploy.ps1 -ResourceGroup rg-nextjs-oneagent -AppName <your-app-name>
```

If your machine blocks PowerShell script execution, use the Command Prompt
helper instead:

```cmd
infra\deploy.cmd rg-nextjs-oneagent <your-app-name>
```

This runs `npm ci`, `npm run build` (Next.js standalone output), zips
`.next/standalone`, and deploys it with `az webapp deploy --type zip`.

## 3. Enable the Dynatrace sidecar

After the Next.js app starts successfully, apply the template again with the
sidecar enabled:

```cmd
az deployment group create --resource-group rg-nextjs-oneagent --template-file infra\main.bicep --parameters infra\main.bicepparam --parameters dtTenantToken="YOUR_TENANT_TOKEN" enableDynatraceSidecar=true
```

This adds the **`dynatrace-oneagent` sidecar container** using the pinned,
versioned `dynatrace/dynatrace-codemodules` image. Do not deploy another zip or
restart the app while the initial OneAgent copy is running.

## 4. Verify

1. In the Azure portal, go to the app's **Deployment Center** and check the
   sidecar's logs for `"msg":"OneAgent has been successfully deployed"`.
2. Restart the app: `az webapp restart --resource-group rg-nextjs-oneagent --name <your-app-name>`.
3. Browse to `https://<your-app-name>.azurewebsites.net/api/health` — once
   OneAgent has deployed and the app has restarted, `dynatrace.oneAgentInjected`
   should be `true`.
4. Check your Dynatrace environment for the incoming host/process telemetry.

## Generate test traffic for Dynatrace

The home page includes a weather form. Each submission calls
`/api/weather`, which performs two server-side outbound HTTPS calls to the
keyless [Open-Meteo](https://open-meteo.com/) APIs:

1. City geocoding
2. Current weather forecast

Use the form repeatedly or call the endpoint directly:

```cmd
curl "https://nextjs-oneagent-demo.azurewebsites.net/api/weather?city=Amsterdam"
curl "https://nextjs-oneagent-demo.azurewebsites.net/api/weather?city=Prague"
curl "https://nextjs-oneagent-demo.azurewebsites.net/api/weather?city=Vienna"
```

In Dynatrace, this should produce an inbound request to the Next.js
`/api/weather` route and outbound calls to `geocoding-api.open-meteo.com` and
`api.open-meteo.com`.

## Debugging: app doesn't show up under Services

`GET /api/dynatrace-diagnostics` reports OneAgent's on-disk state, the tail of
its newest log file, and a live connectivity check to `DT_CONNECTION_POINT`,
without needing SSH:

```cmd
curl "https://nextjs-oneagent-demo.azurewebsites.net/api/dynatrace-diagnostics"
```

It also returns the Azure site/instance identifiers and the current
`containerHostname`. The hostname is a correlation hint, not a guaranteed
Dynatrace host name: App Service can replace containers, and the serverless
OneAgent code module can use a different logical host identity.
Use the response to work through the pipeline in order:

1. **Injection.** `oneAgentPreloadConfigured` and `oneAgentLibraryLoaded`
   should both be `true`. The first only checks configuration; the second
   verifies from `/proc/self/maps` that Linux actually loaded OneAgent into
   this Node.js process.
2. **Hosts.** In Dynatrace, expand the time range and remove management-zone
   filters. Try `containerHostname` as a first correlation, but don't assume
   it must match. Use `azureAppService.siteName` and
   `azureAppService.instanceId` to identify the process through its
   properties. A plain GET connectivity check can return HTTP 400 because
   the endpoint expects the OneAgent protocol; `reachable: true` confirms
   DNS/TLS/network reachability, not successful agent registration.
3. **Processes.** Open the matching host, then its **Processes** tab. Look
   for a `node` process group. If it's missing, OneAgent's native module
   attached to the process but didn't recognize/report it - check
   `oneAgent.installedVersions` and `newestLog.tail` in the diagnostics
   response for errors during code module injection.
4. **Monitoring mode.** If the `node` process group appears but greyed out or
   labeled infrastructure-only, open it and check **Monitoring** settings.
   Full-stack/deep monitoring must be enabled for the process group (and for
   the Node.js technology under **Settings > Monitored technologies**) for
   Dynatrace to derive **Services** from it - infrastructure-only monitoring
   reports the host/process but never creates a Service.
5. **Services.** Only after the process group shows full-stack monitoring and
   has received actual requests will it appear under **Applications &
   Microservices > Services**. Filter by technology `Node.js` and search for
   the app name if it's not immediately visible in a shared/multi-app
   Dynatrace environment.
6. **Token type.** Use a PaaS/API token with the required deployment scope to
   call the Deployment API `connectioninfo` endpoint. Set `DT_TENANTTOKEN` to
   the response's `tenantToken`, not to the PaaS/API token itself.

### HTTP 410 and `Agent DEACTIVATED`

If the Node.js OneAgent log contains:

```text
Initial connect: connection to initial gateways failed (last error http status: 410)
Agent DEACTIVATED (it means the agent has been rejected by the server)
```

the library is loaded and the Dynatrace endpoint is reachable, but the
Dynatrace environment rejected the agent. Call the Deployment API with a valid
PaaS/API token from the same environment, then replace `DT_TENANTTOKEN` with
the returned `tenantToken`. Do not put the PaaS/API token itself in
`DT_TENANTTOKEN`. Save the App Service environment-variable change and restart
the app so the new Node.js process receives the new token.

Old log files remain on persistent storage. After restarting, inspect only the
newest Node.js log and verify that it has no HTTP 410 or `Agent DEACTIVATED`
message:

```bash
LOG=$(find /home/dynatrace/oneagent/active/log/nodejs -type f \
  -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
echo "$LOG"
grep -nE 'Initial connect|410|DEACTIVATED|heartbeat|Connected' "$LOG"
```

## Troubleshooting: stale `deployment.lock`

If every sidecar start reports:

```text
Lock not acquired, lock file already exists
Another instance holds the deployment lock, skipping deployment
```

and no instance subsequently reports successful deployment, the sidecar that
owned the lock was terminated during its initial copy. Remove only the stale
lock and incomplete copy directory, then restart the app once:

1. Open **Development Tools > SSH** in the App Service portal.
2. Inspect the work directory:

   ```bash
   ls -la /home/dynatrace/oneagent/work
   ```

3. Remove the stale lock shown in the sidecar logs:

   ```bash
   rm -f /home/dynatrace/oneagent/work/deployment.lock
   ```

4. If the interrupted copy directory from the log still exists, remove that
   specific directory only. For example:

   ```bash
   rm -rf /home/dynatrace/oneagent/work/copy-work-3278769737
   ```

5. Close SSH and restart the app:

   ```cmd
   az webapp restart --resource-group rg-nextjs-oneagent --name nextjs-oneagent-demo
   ```

Do not redeploy or restart again until the sidecar logs contain
`OneAgent has been successfully deployed`.

## Troubleshooting: `LD_PRELOAD cannot be preloaded`

If you see startup log lines like:

```text
ERROR: ld.so: object '/home/dynatrace/oneagent/active/agent/lib64/liboneagentproc.so' from LD_PRELOAD cannot be preloaded (cannot open shared object file): ignored.
```

it means `LD_PRELOAD` was set before the sidecar had finished copying OneAgent
into `/home/dynatrace/oneagent`. This sample avoids that by **not** setting
`LD_PRELOAD` as a global App Service app setting. Instead, [startup.mjs](startup.mjs)
checks for the OneAgent library and sets `LD_PRELOAD` only for the child Next.js
Node.js process.

If your app was already deployed with the earlier template, apply the update:

```cmd
az webapp config appsettings delete --resource-group rg-nextjs-oneagent --name <your-app-name> --setting-names LD_PRELOAD
infra\deploy.cmd rg-nextjs-oneagent <your-app-name>
az deployment group create --resource-group rg-nextjs-oneagent --template-file infra\main.bicep --parameters infra\main.bicepparam --parameters dtTenantToken="<tenant-token-returned-by-connectioninfo>" enableDynatraceSidecar=true
az webapp restart --resource-group rg-nextjs-oneagent --name <your-app-name>
```

After restart, startup logs should show either:

- `Dynatrace OneAgent library found. Enabling LD_PRELOAD.` when the sidecar has already deployed OneAgent.
- `Dynatrace OneAgent library not found yet. Starting without LD_PRELOAD.` when the sidecar is still installing OneAgent. In that case, wait for the sidecar success message and restart the app once more.

## Troubleshooting: sidecar `ImageNotFoundFailure`

If Azure reports:

```text
Failed to pull image: docker.io/dynatrace/dynatrace-codemodules:latest
```

the sidecar is still configured with the nonexistent `latest` tag. Dynatrace
publishes versioned CodeModules tags only. The sample pins the active,
multi-architecture tag:

```text
dynatrace/dynatrace-codemodules:1.333.75.20260818-075625
```

Update the existing sidecar resource by explicitly enabling it:

```cmd
az deployment group create --resource-group rg-nextjs-oneagent --template-file infra\main.bicep --parameters infra\main.bicepparam --parameters dtTenantToken="<tenant-token-returned-by-connectioninfo>" enableDynatraceSidecar=true
```

Confirm what image is configured on the live Azure child resource:

```cmd
az resource show --resource-group rg-nextjs-oneagent --resource-type Microsoft.Web/sites/sitecontainers --name nextjs-oneagent-demo/dynatrace-oneagent --api-version 2024-04-01 --query properties.image --output tsv
```

The result must be the pinned version, not a value ending in `:latest`.

## Local development

```powershell
npm install
npm run dev
```

Open http://localhost:3000.
