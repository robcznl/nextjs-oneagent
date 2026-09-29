// Shared OpenTelemetry configuration helpers used by instrumentation.ts and
// the /api/health endpoint. Exporter settings come from the standard OTLP
// environment variables so the same build works locally and on App Service.

export const DEFAULT_SERVICE_NAME = "nextjs-oneagent";
export const DEFAULT_OTLP_PROTOCOL = "http/protobuf";

export type OtelExportConfig = {
  serviceName: string;
  /** Normalized base endpoint (no trailing slash); null when not configured. */
  endpoint: string | null;
  protocol: string;
  /** Whether OTEL_EXPORTER_OTLP_HEADERS is set. The value is never exposed. */
  headersConfigured: boolean;
};

export function getOtelExportConfig(env: NodeJS.ProcessEnv = process.env): OtelExportConfig {
  const rawEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;

  return {
    serviceName: env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
    endpoint: rawEndpoint ? rawEndpoint.replace(/\/+$/, "") : null,
    protocol:
      env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL || env.OTEL_EXPORTER_OTLP_PROTOCOL || DEFAULT_OTLP_PROTOCOL,
    headersConfigured: Boolean(env.OTEL_EXPORTER_OTLP_HEADERS || env.OTEL_EXPORTER_OTLP_TRACES_HEADERS),
  };
}

/** Resource attributes describing the Azure App Service instance, when running there. */
export function getAzureResourceAttributes(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const attributes: Record<string, string | undefined> = env.WEBSITE_SITE_NAME
    ? {
        "cloud.provider": "azure",
        "cloud.platform": "azure_app_service",
        "cloud.region": env.REGION_NAME,
        "azure.app_service.site_name": env.WEBSITE_SITE_NAME,
        "azure.app_service.instance_id": env.WEBSITE_INSTANCE_ID,
        "azure.app_service.hostname": env.WEBSITE_HOSTNAME,
      }
    : {};

  return Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
