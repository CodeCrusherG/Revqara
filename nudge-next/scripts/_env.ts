/**
 * Minimal .env loader for the `npx tsx scripts/*` dev helpers (no new deps).
 *
 * Loads `.env.local` then `.env` from the project root (existing process.env
 * always wins). Keeps the scripts runnable without exporting vars by hand and
 * without adding a dotenv dependency. Server-side only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseAndApply(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadEnv(): void {
  const root = process.cwd();
  parseAndApply(resolve(root, ".env.local"));
  parseAndApply(resolve(root, ".env"));
}
