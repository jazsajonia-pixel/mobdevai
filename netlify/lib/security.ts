import { HttpError } from "./http.js";
import { db } from "./db.js";
import { log } from "./log.js";

/**
 * CSRF defence for state-changing requests: the browser-supplied Origin (or Sec-Fetch-Site)
 * must prove the request came from our own pages. Combined with SameSite=Lax cookies.
 */
// Defined next to handle() (which applies it to every mutating request); re-exported for callers.
export { assertSameOrigin } from "./http.js";

/** A fixed-window counter: returns the hit count for the current window. */
export interface RateStore {
  readonly kind: "memory" | "postgres";
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Per function instance — fine for local dev; in production use the shared store. */
export const memoryStore: RateStore = {
  kind: "memory",
  async hit(key, windowMs, now) {
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      buckets.set(key, next);
      if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      return next;
    }
    b.count += 1;
    return b;
  },
};

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

async function hashKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(d).slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Shared across all function instances: one atomic upsert per hit (`db/migrations/003_rate_limits.sql`).
 * Keys are hashed (they contain user ids / IPs). Old windows are pruned occasionally.
 */
export function postgresStore(sql: Sql, random: () => number = Math.random): RateStore {
  return {
    kind: "postgres",
    async hit(key, windowMs, now) {
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const k = await hashKey(key);
      const rows = (await sql`
        INSERT INTO rate_limits (key, window_start, count) VALUES (${k}, ${windowStart}, 1)
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
        RETURNING count`) as { count: number | string }[];
      if (random() < 0.01) void Promise.resolve(sql`DELETE FROM rate_limits WHERE window_start < ${now - 3_600_000}`).catch(() => {});
      return { count: Number(rows[0]?.count ?? 1), resetAt: windowStart + windowMs };
    },
  };
}

let override: RateStore | null = null;
/** Tests: force a store. Pass null to restore automatic selection. */
export function setRateStore(store: RateStore | null): void {
  override = store;
}

function currentStore(): RateStore {
  if (override) return override;
  if (process.env.RATE_LIMIT_STORE === "memory") return memoryStore;
  const sql = db();
  return sql ? postgresStore(sql as unknown as Sql) : memoryStore;
}

/**
 * Fixed-window rate limit. Shared via Postgres when DATABASE_URL is set; per instance otherwise.
 * If the shared store fails, falls back to the in-memory counter (never fails fully open).
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<void> {
  const store = currentStore();
  let r: { count: number; resetAt: number };
  try {
    r = await store.hit(key, windowMs, now);
  } catch (err) {
    log("warn", "rate limit store failed — using memory", { store: store.kind, error: err instanceof Error ? err.message : "unknown" });
    r = await memoryStore.hit(key, windowMs, now);
  }
  if (r.count > limit) {
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.", [], {
      "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - now) / 1000))),
    });
  }
}

export function clientKey(req: Request, ctx: { ip?: string }): string {
  return ctx.ip ?? req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
