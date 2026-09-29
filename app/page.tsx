import { WeatherDemo } from "./weather-demo";

export default function HomePage() {
  return (
    <main style={{ padding: "3rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Next.js on Azure App Service</h1>
      <p>
        This sample app is deployed to Azure App Service (Linux, Node.js runtime) via{" "}
        <strong>zip deploy</strong>. Traces are captured with Next.js&apos; built-in{" "}
        <a
          href="https://nextjs.org/docs/app/guides/open-telemetry"
          target="_blank"
          rel="noreferrer"
        >
          OpenTelemetry instrumentation
        </a>{" "}
        (<code>instrumentation.ts</code>) and exported over OTLP directly to{" "}
        <a href="https://www.dynatrace.com/" target="_blank" rel="noreferrer">
          Dynatrace
        </a>{" "}
        &mdash; no OneAgent or sidecar container required.
      </p>
      <p>
        Check <a href="/api/health">/api/health</a> to see whether the OpenTelemetry SDK is
        registered, how the OTLP exporter is configured, and the <code>traceId</code> of that
        request for lookup in Dynatrace.
      </p>
      <WeatherDemo />
    </main>
  );
}
