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
  AI_NOT_CONFIGURED: {
    title: "AI provider storage isn't set up",
    hint: "The server needs SESSION_SECRET (session-only keys) or ENCRYPTION_KEY + DATABASE_URL (saved keys).",
  },
  AI_INVALID_KEY: {
    title: "The provider rejected the API key",
    hint: "Check the key is correct, active, and has access to this model. Paste it again to replace it.",
  },
  AI_MODEL_NOT_FOUND: {
    title: "Model not available",
    hint: "This key can't use that model, or the name is wrong. Pick one from “Fetch models”.",
  },
  AI_QUOTA_EXCEEDED: {
    title: "Provider rate limit or quota reached",
    hint: "Wait a moment, or check billing and usage limits in the provider's dashboard.",
  },
  AI_PROVIDER_UNAVAILABLE: {
    title: "AI provider not responding",
    hint: "The provider timed out or returned an error. Try again, or switch to another provider.",
  },
  AI_BAD_BASE_URL: {
    title: "Base URL not allowed",
    hint: "Use a public https:// endpoint such as https://api.example.com/v1. Private and local addresses are blocked.",
  },
  AI_NO_PROVIDER: {
    title: "No AI provider configured",
    hint: "Add an API key in Settings → AI providers.",
  },
  AI_STORAGE_FULL: {
    title: "Too many session-only providers",
    hint: "Remove one, or ask the operator to enable encrypted database storage for more.",
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
    hint: "This project requires a runtime that Chrono cannot run in-browser yet.",
  },
  GIT_CONFLICT: {
    title: "The branch changed on GitHub",
    hint: "Someone pushed changes to the same files. Commit to a new branch instead and open a pull request — nothing was lost.",
  },
  BRANCH_EXISTS: { title: "That branch already exists", hint: "Pick another branch name, or commit to the existing branch." },
  BRANCH_PROTECTED: {
    title: "Branch is protected",
    hint: "GitHub doesn't allow direct commits to this branch. Commit to a new branch and open a pull request.",
  },
  NO_CHANGES: { title: "Nothing to commit", hint: "These changes are already on the branch." },
  INTERNAL: { title: "Something went wrong", hint: "An unexpected error occurred. Try again." },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  /** Server request id (X-Request-Id) — quote it when reporting a problem. */
  readonly requestId?: string;
  /** Server-suggested wait before retrying (from Retry-After), in seconds. */
  readonly retryAfterSec?: number;

  constructor(code: ErrorCode, message?: string, status?: number, requestId?: string, retryAfterSec?: number) {
    super(message ?? COPY[code].title);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSec = retryAfterSec;
  }
}

export function describeError(error: unknown): ErrorCopy & { code: ErrorCode; requestId?: string } {
  const code: ErrorCode = error instanceof AppError ? error.code : "INTERNAL";
  return { code, ...COPY[code], requestId: error instanceof AppError ? error.requestId : undefined };
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
