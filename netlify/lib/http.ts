/**
 * Response helpers shared by all Netlify Functions.
 * Error shape: { error: { code, message } } — codes match src/lib/error-codes.ts.
 * Never put secrets, tokens, or raw upstream error bodies into responses or logs.
 */
import type { ErrorCode } from "../../src/lib/error-codes";

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

/**
 * Wraps a handler with method checks and uniform error handling.
 * Unknown errors are logged by name/message only (no request bodies, headers, or tokens).
 */
export function handle(methods: string[], fn: Handler) {
  return async (req: Request, ctx: FnContext = {}): Promise<Response> => {
    if (!methods.includes(req.method)) return methodNotAllowed(methods);
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        const res = errorResponse(err.status, err.code, err.message, err.cookies);
        for (const [k, v] of Object.entries(err.headers)) res.headers.set(k, v);
        return res;
      }
      console.error("[fn] unhandled", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
      return errorResponse(500, "INTERNAL", "Unexpected server error.");
    }
  };
}
