// Next.js instrumentation hook. Runs once when the server process starts,
// before any route is served. Exporter configuration comes entirely from the
// standard OTLP environment variables (see README):
//   OTEL_EXPORTER_OTLP_ENDPOINT  https://<env-id>.live.dynatrace.com/api/v2/otlp
//   OTEL_EXPORTER_OTLP_PROTOCOL  http/protobuf
//   OTEL_EXPORTER_OTLP_HEADERS   Authorization=Api-Token <token>
//   OTEL_SERVICE_NAME            optional; overrides DEFAULT_SERVICE_NAME
import packageJson from "./package.json";
import { DEFAULT_SERVICE_NAME, getAzureResourceAttributes, getOtelExportConfig } from "./lib/otel";

export async function register() {
  // @vercel/otel supports the edge runtime, but this app only uses Node.js.
  // Keep the gate so the hook stays safe if middleware/edge routes are added.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const config = getOtelExportConfig();

  if (config.endpoint && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // @vercel/otel builds `${endpoint}/v1/traces`; a trailing slash would yield "//v1/traces".
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, "");
  }

  if (!config.endpoint) {
    console.warn(
      "[otel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Tracing is registered but spans will not be exported.",
    );
  }

  const { registerOTel } = await import("@vercel/otel");

  registerOTel({
    serviceName: DEFAULT_SERVICE_NAME,
    attributes: {
      "service.version": packageJson.version,
      ...getAzureResourceAttributes(),
    },
  });

  console.log(
    `[otel] OpenTelemetry registered (service.name=${config.serviceName}, ` +
      `endpoint=${config.endpoint ?? "<none>"}, protocol=${config.protocol}, ` +
      `headers=${config.headersConfigured ? "configured" : "none"})`,
  );
}
