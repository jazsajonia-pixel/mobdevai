/**
 * Response helpers shared by all Netlify Functions.
 * Error shape: { error: { code, message } } — codes match src/lib/error-codes.ts.
 * Never put secrets, tokens, or raw upstream error bodies into responses or logs.
 */
import type { ErrorCode } from "../../src/lib/error-codes";
import { appOrigin } from "./env";
import { log, newRequestId } from "./log";

export type ServerErrorCode = ErrorCode;

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(body: unknown, init: ResponseInit & { cookies?: string[] } = {}): Response {
  const { cookies, headers, ...rest } = init;
  const h = new Headers({ ...BASE_HEADERS, ...(headers as Record<string, string> | undefined) });
  for (const c of cookies ?? []) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { ...rest, headers: h });
}

export function errorResponse(status: number, code: ServerErrorCode, message: string, cookies: string[] = []): Response {
  return json({ error: { code, message } }, { status, cookies });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: { code: "VALIDATION_FAILED", message: `Method not allowed. Use ${allowed.join(", ")}.` } },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}

/** Throw from anywhere inside a handler; `handle()` turns it into a JSON error response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ServerErrorCode,
    message: string,
    readonly cookies: string[] = [],
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FnContext {
  params?: Record<string, string>;
  ip?: string;
}

type Handler = (req: Request, ctx: FnContext) => Promise<Response>;

/** CSRF guard: reject cross-site requests (Origin, falling back to Sec-Fetch-Site). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).origin, appOrigin(req)]);
  if (origin) {
    if (!allowed.has(origin)) throw new HttpError(403, "FORBIDDEN", "Cross-site request blocked.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "FORBIDDEN", "Cross-site request blocked.");
}

/**
 * Wraps a handler with method checks and uniform error handling.
 * Every non-GET request must be same-origin (defense in depth — handlers may check again).
 * Unknown errors are logged by name/message only (no request bodies, headers, or tokens).
 */
export function handle(methods: string[], fn: Handler) {
  return async (req: Request, ctx: FnContext = {}): Promise<Response> => {
    const started = Date.now();
    // Netlify sets x-nf-request-id; reuse it so our logs line up with the platform's.
    const requestId = (req.headers.get("x-nf-request-id") ?? "").replace(/[^\w-]/g, "").slice(0, 40) || newRequestId();
    const path = safePath(req.url);
    let res: Response;
    let code: string | undefined;
    if (!methods.includes(req.method)) {
      res = methodNotAllowed(methods);
      code = "METHOD_NOT_ALLOWED";
    } else {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
        res = await fn(req, ctx);
      } catch (err) {
        if (err instanceof HttpError) {
          code = err.code;
          res = json({ error: { code: err.code, message: err.message, requestId } }, { status: err.status, cookies: err.cookies });
          for (const [k, v] of Object.entries(err.headers)) res.headers.set(k, v);
        } else {
          code = "INTERNAL";
          log("error", "unhandled", { requestId, path, method: req.method, error: err instanceof Error ? `${err.name}: ${err.message}` : "unknown error" });
          res = json({ error: { code: "INTERNAL", message: "Unexpected server error.", requestId } }, { status: 500 });
        }
      }
    }
    try {
      res.headers.set("X-Request-Id", requestId);
    } catch {
      /* immutable headers (e.g. a passthrough Response) */
    }
    const ms = Date.now() - started;
    log(res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info", "request", { requestId, method: req.method, path, status: res.status, ms, code });
    return res;
  };
}

/** Path without query string (queries can carry refs/paths but never secrets — still, keep logs lean). */
function safePath(url: string): string {
  try {
    return new URL(url).pathname.slice(0, 200);
  } catch {
    return "?";
  }
}
