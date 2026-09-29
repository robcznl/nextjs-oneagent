// Copies the assets that Next.js "standalone" output does not include by default
// (public/ and .next/static/) into .next/standalone so `node server.js` can serve them.
// Uses fs.cpSync (Node >=16.7) for cross-platform support (Windows/macOS/Linux/Oryx build).
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.warn("[copy-standalone-assets] .next/standalone not found, skipping.");
  process.exit(0);
}

const copies = [
  { from: join(root, "public"), to: join(standaloneDir, "public") },
  { from: join(root, ".next", "static"), to: join(standaloneDir, ".next", "static") },
];

for (const { from, to } of copies) {
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    console.log(`[copy-standalone-assets] copied ${from} -> ${to}`);
  }
}
