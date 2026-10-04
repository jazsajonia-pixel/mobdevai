/**
 * Error codes shared by the client (src/lib/errors.ts) and Netlify Functions (netlify/lib/http.ts).
 * Pure module — safe to import from both sides.
 */
export const ERROR_CODES = [
  "NETWORK_OFFLINE",
  "NETWORK_TIMEOUT",
  "BACKEND_UNAVAILABLE",
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "GITHUB_OAUTH_NOT_CONFIGURED",
  "OAUTH_DENIED",
  "OAUTH_STATE_MISMATCH",
  "OAUTH_EXCHANGE_FAILED",
  "GITHUB_UNAVAILABLE",
  "EMPTY_REPOSITORY",
  "FILE_TOO_LARGE",
  "BINARY_FILE",
  "AI_NOT_CONFIGURED",
  "AI_INVALID_KEY",
  "AI_MODEL_NOT_FOUND",
  "AI_QUOTA_EXCEEDED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_BAD_BASE_URL",
  "AI_NO_PROVIDER",
  "AI_STORAGE_FULL",
  "NOT_IMPLEMENTED",
  "UNSUPPORTED_PROJECT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
