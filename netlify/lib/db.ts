import { log } from "./log.js";
import { neon } from "@neondatabase/serverless";
import { isSet } from "./env.js";
import type { SessionUser } from "../../src/types/github.js";

/**
 * Optional persistence (Neon / PostgreSQL). Sign-in works without a database; when DATABASE_URL
 * is set we record the user and their GitHub connection metadata — never tokens.
 */
export function db() {
  const url = process.env.DATABASE_URL;
  return isSet(url) ? neon(url) : null;
}

export async function recordLogin(user: SessionUser, scopes: string[], includePrivate: boolean): Promise<void> {
  const sql = db();
  if (!sql) return;
  try {
    const rows = (await sql`
      INSERT INTO users (github_id, login, name, avatar_url)
      VALUES (${user.id}, ${user.login}, ${user.name}, ${user.avatarUrl})
      ON CONFLICT (github_id) DO UPDATE
        SET login = EXCLUDED.login, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, last_login_at = now()
      RETURNING id`) as { id: number }[];
    const id = rows[0]?.id;
    if (id === undefined) return;
    await sql`
      INSERT INTO github_connections (user_id, scopes, include_private)
      VALUES (${id}, ${scopes}, ${includePrivate})
      ON CONFLICT (user_id) DO UPDATE
        SET scopes = EXCLUDED.scopes, include_private = EXCLUDED.include_private, updated_at = now()`;
  } catch (err) {
    // Non-fatal: sign-in must not depend on the database being reachable.
    log("warn", "db recordLogin failed", { error: err instanceof Error ? err.message : "unknown" });
  }
}
