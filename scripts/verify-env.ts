/**
 * Check deployment configuration before (or after) going live. Prints variable names and
 * pass/fail only — never values.
 *
 *   npm run verify:env                 # checks .env (if present) + current environment as production
 *   npm run verify:env -- --local      # local-development rules
 *   npm run verify:env -- --url https://your-site.netlify.app   # ask a deployed site's /api/health
 */
import { readiness } from "../netlify/lib/env";

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");

if (urlIdx >= 0) {
  const base = args[urlIdx + 1];
  if (!base) {
    console.error("--url needs a value");
    process.exit(2);
  }
  const res = await fetch(new URL("/api/health", base));
  const body = (await res.json().catch(() => null)) as { ready?: boolean; version?: string; commit?: string | null; failing?: { id: string; level: string }[] } | null;
  if (!res.ok || !body) {
    console.error(`✗ ${base}/api/health → HTTP ${res.status} (are Netlify Functions deployed?)`);
    process.exit(1);
  }
  console.log(`${body.ready ? "✓" : "✗"} ${base} · v${body.version} · ${body.commit ?? "no commit ref"}`);
  for (const f of body.failing ?? []) console.log(`  ${f.level === "error" ? "✗" : "!"} ${f.id}`);
  process.exit(body.ready ? 0 : 1);
}

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env */
}
const production = !args.includes("--local");
const r = readiness(process.env, production);
console.log(`Checking ${production ? "production" : "local"} configuration\n`);
for (const c of r.checks) console.log(`${c.ok ? "✓" : c.level === "error" ? "✗" : "!"} ${c.id.padEnd(20)} ${c.ok ? "" : c.message}`);
console.log(`\n${r.ready ? "Ready." : "Not ready — fix the ✗ items."}`);
process.exit(r.ready ? 0 : 1);
