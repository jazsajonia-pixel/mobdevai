import { HttpError } from "./http";

/**
 * CSRF defence for state-changing requests: the browser-supplied Origin (or Sec-Fetch-Site)
 * must prove the request came from our own pages. Combined with SameSite=Lax cookies.
 */
// Defined next to handle() (which applies it to every mutating request); re-exported for callers.
export { assertSameOrigin } from "./http";

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Best-effort fixed-window rate limit per function instance.
 * TODO(phase-8): back with a shared store (e.g. Netlify Blobs / Postgres) for global limits.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.", [], {
      "Retry-After": String(Math.ceil((b.resetAt - now) / 1000)),
    });
  }
}

export function clientKey(req: Request, ctx: { ip?: string }): string {
  return ctx.ip ?? req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
