import { NextResponse } from "next/server";

// Simple health/diagnostics endpoint that also surfaces whether the Dynatrace
// OneAgent sidecar has injected itself into this process via LD_PRELOAD.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    dynatrace: {
      ldPreload: process.env.LD_PRELOAD ?? null,
      oneAgentInjected: Boolean(
        process.env.LD_PRELOAD && process.env.LD_PRELOAD.includes("liboneagentproc")
      ),
      connectionPointConfigured: Boolean(process.env.DT_CONNECTION_POINT),
    },
  });
}
