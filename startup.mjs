import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const oneAgentLib = "/home/dynatrace/oneagent/active/agent/lib64/liboneagentproc.so";
const env = { ...process.env };

if (existsSync(oneAgentLib)) {
  console.log("Dynatrace OneAgent library found. Enabling LD_PRELOAD.");
  env.LD_PRELOAD = oneAgentLib;
} else {
  console.log("Dynatrace OneAgent library not found yet. Starting without LD_PRELOAD.");
  console.log("Check the dynatrace-oneagent sidecar logs, then restart the app after OneAgent is deployed.");
}

const child = spawn(process.execPath, ["server.js"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
