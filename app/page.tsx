import { WeatherDemo } from "./weather-demo";

export default function HomePage() {
  return (
    <main style={{ padding: "3rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Next.js on Azure App Service</h1>
      <p>
        This sample app is deployed to Azure App Service (Linux, Node.js runtime) via{" "}
        <strong>zip deploy</strong>, with the{" "}
        <a href="https://www.dynatrace.com/" target="_blank" rel="noreferrer">
          Dynatrace OneAgent
        </a>{" "}
        injected via a sidecar container (<code>dynatrace/dynatrace-codemodules</code>) using{" "}
        <code>LD_PRELOAD</code>.
      </p>
      <p>
        Check <a href="/api/health">/api/health</a> to see whether the OneAgent{" "}
        <code>LD_PRELOAD</code> environment variable is visible to this Node.js process.
      </p>
      <WeatherDemo />
    </main>
  );
}
