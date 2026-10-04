import { AppError, codeFromStatus, isErrorCode } from "./errors";

/**
 * Thin client for our own Netlify Functions under /api/*.
 * - Never sends secrets: the browser only ever holds an HTTP-only session cookie (Phase 1).
 * - Normalises every failure into an AppError with a user-readable code.
 */

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  timeoutMs?: number;
}

const API_BASE = "/api";

/** Fired when the server says the GitHub session is gone; the session store signs the user out. */
export const SESSION_EXPIRED_EVENT = "mdai:session-expired";

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, timeoutMs = 15_000, headers, signal: outer, ...rest } = options;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AppError("NETWORK_OFFLINE");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Caller cancellation (e.g. "Stop" in the agent) aborts the request too.
  const onAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "mobile-development-ai",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (outer?.aborted) throw err;
      throw new AppError("NETWORK_TIMEOUT");
    }
    throw new AppError("BACKEND_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }

  const contentType = response.headers.get("content-type") ?? "";
  // A static host (e.g. plain `vite` dev or a static preview) answers /api/* with index.html.
  if (!contentType.includes("application/json")) {
    throw new AppError("BACKEND_UNAVAILABLE", undefined, response.status);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const serverCode =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { code?: unknown; message?: unknown } }).error
        : undefined;
    const code = isErrorCode(serverCode?.code) ? serverCode.code : codeFromStatus(response.status);
    const message = typeof serverCode?.message === "string" ? serverCode.message : undefined;
    if (code === "SESSION_EXPIRED" || (code === "UNAUTHENTICATED" && path.startsWith("/github/"))) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: code }));
    }
    throw new AppError(code, message, response.status);
  }

  return payload as T;
}
