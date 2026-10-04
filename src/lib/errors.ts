/**
 * Central error vocabulary. Every failure shown in the UI maps to one of these codes so
 * messages stay consistent and understandable ("what happened" + "what to do next").
 * The same codes are emitted by Netlify Functions (see netlify/lib/http.ts).
 */
import { ERROR_CODES, isErrorCode, type ErrorCode } from "./error-codes";

export { ERROR_CODES, isErrorCode, type ErrorCode };

export interface ErrorCopy {
  title: string;
  hint: string;
}

const COPY: Record<ErrorCode, ErrorCopy> = {
  NETWORK_OFFLINE: {
    title: "You're offline",
    hint: "Check your connection. Unsaved work stays on this device.",
  },
  NETWORK_TIMEOUT: {
    title: "The request timed out",
    hint: "Mobile networks can be slow — try again in a moment.",
  },
  BACKEND_UNAVAILABLE: {
    title: "Backend not reachable",
    hint: "Netlify Functions aren't running. Locally, start the app with `netlify dev` instead of `vite`.",
  },
  UNAUTHENTICATED: {
    title: "Sign in required",
    hint: "Sign in with GitHub, or explore the demo workspace.",
  },
  SESSION_EXPIRED: {
    title: "Your session expired",
    hint: "Sign in with GitHub again to continue. Local drafts are kept.",
  },
  FORBIDDEN: {
    title: "Missing permission",
    hint: "Your GitHub account can't access this resource. Check the repository's access settings.",
  },
  NOT_FOUND: { title: "Not found", hint: "It may have been moved, renamed, or deleted." },
  RATE_LIMITED: {
    title: "Rate limit reached",
    hint: "Too many requests in a short time. Wait a minute and try again.",
  },
  VALIDATION_FAILED: { title: "Invalid request", hint: "Some input wasn't accepted. Review it and retry." },
  GITHUB_OAUTH_NOT_CONFIGURED: {
    title: "GitHub sign-in isn't configured",
    hint: "Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SESSION_SECRET in Netlify environment variables.",
  },
  OAUTH_DENIED: {
    title: "GitHub access wasn't granted",
    hint: "You cancelled the GitHub authorization. Try again when you're ready.",
  },
  OAUTH_STATE_MISMATCH: {
    title: "Sign-in link expired",
    hint: "The sign-in attempt timed out or was opened in another browser. Start again from this screen.",
  },
  OAUTH_EXCHANGE_FAILED: {
    title: "GitHub sign-in failed",
    hint: "GitHub didn't accept the sign-in. Check the OAuth app's client ID, secret and callback URL.",
  },
  GITHUB_UNAVAILABLE: {
    title: "GitHub isn't responding",
    hint: "GitHub returned a server error. Check githubstatus.com and try again shortly.",
  },
  EMPTY_REPOSITORY: {
    title: "This repository is empty",
    hint: "There are no commits yet. Push an initial commit on GitHub, then reload.",
  },
  FILE_TOO_LARGE: {
    title: "File too large to open",
    hint: "Files over 1 MB can't be opened on mobile yet. View it on GitHub instead.",
  },
  BINARY_FILE: {
    title: "Binary file",
    hint: "This file isn't text (image, font, archive…) so it can't be shown in the editor.",
  },
  NOT_IMPLEMENTED: {
    title: "Not available yet",
    hint: "This capability is planned for an upcoming phase.",
  },
  UNSUPPORTED_PROJECT: {
    title: "Unsupported project type",
    hint: "This project requires a runtime that Mobile Development AI cannot run in-browser yet.",
  },
  INTERNAL: { title: "Something went wrong", hint: "An unexpected error occurred. Try again." },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;

  constructor(code: ErrorCode, message?: string, status?: number) {
    super(message ?? COPY[code].title);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function describeError(error: unknown): ErrorCopy & { code: ErrorCode } {
  const code: ErrorCode = error instanceof AppError ? error.code : "INTERNAL";
  return { code, ...COPY[code] };
}

/** Map an HTTP status to the closest error code when the server didn't send one. */
export function codeFromStatus(status: number): ErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422 || status === 400) return "VALIDATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 501) return "NOT_IMPLEMENTED";
  if (status === 502 || status === 503 || status === 504) return "BACKEND_UNAVAILABLE";
  return "INTERNAL";
}
