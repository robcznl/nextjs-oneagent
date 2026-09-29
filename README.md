# nextjs-oneagent

A sample Next.js app deployed to **Azure App Service (Linux)** via **zip deploy**
(no Docker/custom container), exporting **OpenTelemetry traces directly to
Dynatrace** through Next.js' native
[`instrumentation.ts`](https://nextjs.org/docs/app/guides/instrumentation) hook.

There is **no Dynatrace OneAgent, no sidecar container and no `LD_PRELOAD`**.
Everything runs inside the Node.js process and is configured with the standard
`OTEL_*` environment variables.

References:

- [Next.js: How to set up instrumentation with OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry)
- [Dynatrace: OTLP API endpoints](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api)
- [Dynatrace: Instrument your Node.js application with OpenTelemetry](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/walkthroughs/nodejs)

## How it works

- The **Next.js app** is built locally/in CI with `output: 'standalone'` and
  deployed as a plain zip package to the App Service's built-in Node.js
  runtime. App Service starts it with `node server.js`.
- [instrumentation.ts](instrumentation.ts) is picked up automatically by
  Next.js and runs once when the server starts. It calls `registerOTel()` from
  [`@vercel/otel`](https://www.npmjs.com/package/@vercel/otel), which sets up
  the OpenTelemetry SDK, W3C trace-context propagation, `fetch`
  instrumentation and an **OTLP/HTTP protobuf** trace exporter.
- The exporter is configured entirely from environment variables (set as App
  Service app settings by [infra/main.bicep](infra/main.bicep)):

  | Variable                       | Value                                                              |
  | ------------------------------ | ------------------------------------------------------------------ |
  | `OTEL_EXPORTER_OTLP_ENDPOINT`  | `https://<environment-id>.live.dynatrace.com/api/v2/otlp` (no trailing slash; `/v1/traces` is appended) |
  | `OTEL_EXPORTER_OTLP_PROTOCOL`  | `http/protobuf` (Dynatrace accepts protobuf only; no JSON, no gRPC) |
  | `OTEL_EXPORTER_OTLP_HEADERS`   | `Authorization=Api-Token <token>`                                  |
  | `OTEL_SERVICE_NAME`            | Service name shown in Dynatrace (defaults to `nextjs-oneagent`)     |

- Next.js already instruments itself, so every route handler / page render
  produces spans, and `@vercel/otel`'s `fetch` instrumentation adds child spans
  for outbound HTTP calls. No manual spans are needed for the demo.
- Resource attributes include `service.name`, `service.version` (from
  `package.json`) and, when running on App Service, `cloud.provider=azure`,
  `cloud.platform=azure_app_service`, `cloud.region` and
  `azure.app_service.site_name` / `instance_id` / `hostname` for correlation.

```
┌──────────────── App Service (Linux, code-based zip deploy) ────────────────┐
│                                                                             │
│  node server.js                                                             │
│  └─ instrumentation.ts → registerOTel() (@vercel/otel)                      │
│       ├─ Next.js built-in spans (route handlers, rendering)                 │
│       ├─ fetch instrumentation (outbound HTTPS to Open-Meteo)               │
│       └─ OTLP/HTTP protobuf exporter ──────────────────────────────────────┼──► https://<env-id>.live.dynatrace.com/api/v2/otlp/v1/traces
│                                                                             │      Authorization: Api-Token <token>
│  app settings: OTEL_EXPORTER_OTLP_ENDPOINT / _PROTOCOL / _HEADERS,          │
│                OTEL_SERVICE_NAME                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Repo layout

```
nextjs-oneagent/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx
│   ├── weather-demo.tsx        # client form that calls /api/weather
│   ├── api/health/route.ts     # reports OTel registration/export config + current traceId
│   └── api/weather/route.ts    # two outbound HTTPS calls (Open-Meteo) → child spans
├── instrumentation.ts          # Next.js instrumentation hook → registerOTel()
├── lib/otel.ts                 # shared OTLP config + Azure resource attribute helpers
├── scripts/
│   └── copy-standalone-assets.mjs  # postbuild: copies public/ + .next/static into standalone output
├── infra/
│   ├── main.bicep              # App Service Plan + Web App with OTEL_* app settings
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
- A Dynatrace environment and an **access token** with the
  **`openTelemetryTrace.ingest`** scope ("Ingest OpenTelemetry traces").

### Create the Dynatrace access token

In Dynatrace go to **Access Tokens > Generate new token**, give it a name and
select the scope **Ingest OpenTelemetry traces** (`openTelemetryTrace.ingest`).
Copy the token (`dt0c01.…`); it's only shown once. Treat it as a secret: don't
commit it or print it in logs.

The OTLP base endpoint for a SaaS environment is:

```text
https://<environment-id>.live.dynatrace.com/api/v2/otlp
```

For an ActiveGate or Managed environment use
`https://<activegate-host>:9999/e/<environment-id>/api/v2/otlp`. See
[Dynatrace OTLP API endpoints](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api).

## 1. Provision the App Service

Edit [infra/main.bicepparam](infra/main.bicepparam) with your app name, region
and OTLP endpoint. Pass the token inline so it never lands in source control:

```powershell
az group create --name rg-nextjs-oneagent --location westeurope

az deployment group create `
  --resource-group rg-nextjs-oneagent `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam `
  --parameters dtApiToken="dt0c01.XXXX"
```

Command Prompt equivalent:

```cmd
az deployment group create --resource-group rg-nextjs-oneagent --template-file infra\main.bicep --parameters infra\main.bicepparam --parameters dtApiToken="dt0c01.XXXX"
```

This creates:

- A **Linux App Service Plan** (`S1` by default; `B1` also works now that no
  sidecar is involved)
- A **Linux Web App** (`NODE|24-lts`, code-based/zip deploy,
  `appCommandLine: node server.js`) with the `OTEL_*` app settings listed above

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

## 3. Verify

1. Browse to `https://<your-app-name>.azurewebsites.net/api/health`. You should
   see `otel.tracerProviderRegistered: true`, `endpointConfigured: true`,
   `headersConfigured: true`, `protocol: "http/protobuf"` and a non-null
   `traceId`.
2. In Dynatrace open **Distributed Traces** (or **Services** and pick the
   service named after `OTEL_SERVICE_NAME`) and search for that `traceId`.
3. Check the App Service **Log stream** for the startup line
   `[otel] OpenTelemetry registered (service.name=…, endpoint=…, protocol=http/protobuf, headers=configured)`.

## Generate test traffic for Dynatrace

The home page includes a weather form. Each submission calls
`/api/weather`, which performs two server-side outbound HTTPS calls to the
keyless [Open-Meteo](https://open-meteo.com/) APIs:

1. City geocoding
2. Current weather forecast

Use the form repeatedly or call the endpoint directly:

```cmd
curl "https://<your-app-name>.azurewebsites.net/api/weather?city=Amsterdam"
curl "https://<your-app-name>.azurewebsites.net/api/weather?city=Prague"
curl "https://<your-app-name>.azurewebsites.net/api/weather?city=Vienna"
```

In Dynatrace each request appears as a trace with a root span for
`GET /api/weather` and two child spans for the calls to
`geocoding-api.open-meteo.com` and `api.open-meteo.com`.

## Local development

Create a `.env.local` (already gitignored) with the same variables and run the
dev server; `instrumentation.ts` runs in `next dev` too:

```text
OTEL_SERVICE_NAME=nextjs-oneagent-local
OTEL_EXPORTER_OTLP_ENDPOINT=https://<environment-id>.live.dynatrace.com/api/v2/otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Api-Token dt0c01.XXXX
```

```cmd
npm install
npm run dev
```

To see more Next.js-internal spans (rendering, module resolution, …) set
`NEXT_OTEL_VERBOSE=1`. To debug the exporter itself set
`OTEL_LOG_LEVEL=debug`.

Without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK still registers (so `traceId`s
are generated) but nothing is exported, and a warning is logged at startup.

## Troubleshooting

### No traces in Dynatrace

1. **Check `/api/health`.** If `tracerProviderRegistered` is `false`,
   `instrumentation.ts` did not run. It must be in the project root (not in
   `app/`) and the route must run on the Node.js runtime (`NEXT_RUNTIME ===
   'nodejs'`). Confirm the `[otel] OpenTelemetry registered` line in the log
   stream.
2. **Set `OTEL_LOG_LEVEL=debug`** as an app setting and restart. Exporter
   failures are logged with the HTTP status returned by Dynatrace:
   - **401 / 403** – token missing, wrong, or lacking the
     `openTelemetryTrace.ingest` scope. Check `OTEL_EXPORTER_OTLP_HEADERS`
     is exactly `Authorization=Api-Token <token>` (note the space after
     `Api-Token`).
   - **404** – wrong endpoint path. `OTEL_EXPORTER_OTLP_ENDPOINT` must end
     with `/api/v2/otlp` (no trailing slash); the exporter appends
     `/v1/traces`.
   - **415 / 400** – wrong protocol. Dynatrace requires
     `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`.
3. **Restart after changing app settings.** Environment variables are read
   once at process start.
4. **Time range / filters.** Widen the time range in Distributed Traces and
   remove management-zone filters. Search by the `traceId` from
   `/api/health` rather than by service name first.

### Duplicate outbound spans

`@vercel/otel` disables Next.js' own `fetch` span (`NEXT_OTEL_FETCH_DISABLED=1`)
and replaces it with its own instrumentation, so each outbound call produces a
single span. If you add `@opentelemetry/instrumentation-http` or
`instrumentation-undici` yourself you will get duplicates; don't.
