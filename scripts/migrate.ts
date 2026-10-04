/**
 * Applies db/migrations/*.sql in order. Usage: DATABASE_URL=… npm run db:migrate
 * Migrations are idempotent (CREATE … IF NOT EXISTS).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env */
}

const url = process.env.DATABASE_URL;
if (!url || /^(postgres:\/\/user:password@host)/.test(url)) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(url);
const dir = join(process.cwd(), "db", "migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const statements = readFileSync(join(dir, file), "utf8")
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  console.log(`applied ${file}`);
}
