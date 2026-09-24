import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

const ONEAGENT_ROOT = "/home/dynatrace/oneagent";
const ONEAGENT_ACTIVE = join(ONEAGENT_ROOT, "active");
// Candidate log locations across OneAgent/CodeModules layouts; not all exist in every version.
const LOG_DIR_CANDIDATES = [
  join(ONEAGENT_ACTIVE, "agent", "log"),
  join(ONEAGENT_ACTIVE, "log"),
  join(ONEAGENT_ROOT, "log"),
];

type FileInfo = {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
};

function listDir(path: string, maxEntries = 50): FileInfo[] | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return readdirSync(path)
      .slice(0, maxEntries)
      .map((name) => {
        const stats = statSync(join(path, name));
        return {
          name,
          path: join(path, name),
          isDirectory: stats.isDirectory(),
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch {
    return null;
  }
}

function tailFile(path: string, maxLines = 40): string[] | null {
  try {
    const content = readFileSync(path, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return null;
  }
}

function findLogFiles(dir: string, depth = 0): FileInfo[] {
  if (depth > 4) {
    return [];
  }

  const entries = listDir(dir) ?? [];
  return entries.flatMap((entry) => {
    if (entry.isDirectory) {
      return findLogFiles(entry.path, depth + 1);
    }
    return entry.name.endsWith(".log") ? [entry] : [];
  });
}

function isOneAgentLibraryLoaded(): boolean | null {
  try {
    return readFileSync("/proc/self/maps", "utf8").includes("liboneagentproc.so");
  } catch {
    return null;
  }
}

async function checkConnectionPoint(connectionPoint: string) {
  try {
    const response = await fetch(connectionPoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return { reachable: true, status: response.status };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown connectivity error",
    };
  }
}

// Diagnostics endpoint that inspects the OneAgent installation/log files on the
// shared persistent volume and checks live connectivity to Dynatrace, so you
// don't need SSH access to debug why a service isn't reporting.
export async function GET() {
  const oneAgentRootExists = existsSync(ONEAGENT_ROOT);
  const oneAgentActiveExists = existsSync(ONEAGENT_ACTIVE);
  const oneAgentVersionDirs = listDir(ONEAGENT_ROOT) ?? [];

  const logDirResults = LOG_DIR_CANDIDATES.map((dir) => ({
    dir,
    files: listDir(dir),
  })).filter((result): result is { dir: string; files: FileInfo[] } => result.files !== null);

  const logFiles = LOG_DIR_CANDIDATES.flatMap((dir) => findLogFiles(dir))
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.path === entry.path) === index,
    )
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const newestLogFile = logFiles[0] ?? null;

  const connectionPoint = process.env.DT_CONNECTION_POINT;
  const connectivity = connectionPoint ? await checkConnectionPoint(connectionPoint) : null;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    // Match this against the "Name" column in Dynatrace > Hosts: App Service Linux
    // often reports a container ID as the hostname, but the logical Dynatrace
    // host can differ when the serverless code module creates the entity.
    containerHostname: hostname(),
    azureAppService: {
      siteName: process.env.WEBSITE_SITE_NAME ?? null,
      instanceId: process.env.WEBSITE_INSTANCE_ID ?? null,
      defaultHostname: process.env.WEBSITE_HOSTNAME ?? null,
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
    },
    ldPreload: process.env.LD_PRELOAD ?? null,
    oneAgentPreloadConfigured: Boolean(
      process.env.LD_PRELOAD && process.env.LD_PRELOAD.includes("liboneagentproc"),
    ),
    oneAgentLibraryLoaded: isOneAgentLibraryLoaded(),
    oneAgent: {
      rootDirectoryExists: oneAgentRootExists,
      activeDirectoryExists: oneAgentActiveExists,
      installedVersions: oneAgentVersionDirs.map((entry) => entry.name),
    },
    logs: logDirResults.map((result) => ({
      directory: result.dir,
      files: result.files,
    })),
    discoveredLogFiles: logFiles,
    newestLog: newestLogFile
      ? {
          path: newestLogFile.path,
          tail: tailFile(newestLogFile.path),
        }
      : null,
    dynatraceConnection: {
      connectionPointConfigured: Boolean(connectionPoint),
      tenantConfigured: Boolean(process.env.DT_TENANT),
      // Never echo the token itself, only whether it is set.
      tenantTokenConfigured: Boolean(process.env.DT_TENANTTOKEN),
      connectivity,
    },
  });
}
