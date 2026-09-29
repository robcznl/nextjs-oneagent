import { NextResponse } from "next/server";
import { trace } from "@opentelemetry/api";
import { getOtelExportConfig } from "@/lib/otel";

export const dynamic = "force-dynamic";

// Health endpoint that also reports whether OpenTelemetry was registered by
// instrumentation.ts and how the OTLP exporter is configured. Secret values
// (OTEL_EXPORTER_OTLP_HEADERS) are reported as booleans only.
export async function GET() {
  const config = getOtelExportConfig();

  // @opentelemetry/api returns a ProxyTracerProvider whose delegate stays the
  // NoopTracerProvider until an SDK registers itself.
  const provider = trace.getTracerProvider() as { getDelegate?: () => object };
  const delegate = provider.getDelegate?.();
  const tracerProviderRegistered = Boolean(
    delegate && delegate.constructor.name !== "NoopTracerProvider",
  );

  const spanContext = trace.getActiveSpan()?.spanContext();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    otel: {
      tracerProviderRegistered,
      serviceName: config.serviceName,
      endpoint: config.endpoint,
      endpointConfigured: config.endpoint !== null,
      headersConfigured: config.headersConfigured,
      protocol: config.protocol,
      // Search for this trace ID in Dynatrace > Distributed Traces to find this request.
      traceId: spanContext?.traceId ?? null,
      spanId: spanContext?.spanId ?? null,
    },
  });
}
