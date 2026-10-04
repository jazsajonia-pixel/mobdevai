/**
 * Response helpers shared by all Netlify Functions.
 * Error shape: { error: { code, message } } — codes match src/lib/errors.ts.
 * Never put secrets, tokens, or raw upstream error bodies into responses or logs.
 */

export type ServerErrorCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "VALIDATION_FAILED"
  | "GITHUB_OAUTH_NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) },
  });
}

export function errorResponse(status: number, code: ServerErrorCode, message: string): Response {
  return json({ error: { code, message } }, { status });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: { code: "VALIDATION_FAILED", message: `Method not allowed. Use ${allowed.join(", ")}.` } },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}
