/**
 * Client-side error reporting → POST /api/client-errors (server logs, redacted).
 * Sends only: message, a trimmed stack, the route (hash path, no query), app version and a coarse
 * user agent. Never file contents, prompts, tokens or keys. Capped per page load and de-duplicated.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const MAX_REPORTS = 5;
let sent = 0;
const seen = new Set<string>();

export interface ClientErrorReport {
  kind: "boundary" | "error" | "unhandledrejection";
  message: string;
  stack?: string;
  route: string;
  release: string;
}

function route(): string {
  const h = typeof location !== "undefined" ? location.hash.replace(/^#/, "") : "";
  // Keep the route shape but drop repo/file names after /projects/ and any query.
  return (h.split("?")[0] ?? "/").replace(/^(\/app\/projects)\/[^/]+\/[^/]+/, "$1/:owner/:repo").slice(0, 120) || "/";
}

function trimStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .split("\n")
    .slice(0, 12)
    .map((l) => l.replace(/\?[^\s):]*/g, "").slice(0, 300))
    .join("\n");
}

export function buildReport(kind: ClientErrorReport["kind"], err: unknown): ClientErrorReport {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Non-error thrown");
  return { kind, message: e.message.slice(0, 300) || e.name, stack: trimStack(e.stack), route: route(), release: APP_VERSION };
}

export function reportError(kind: ClientErrorReport["kind"], err: unknown, send: (r: ClientErrorReport) => void = post): boolean {
  if (sent >= MAX_REPORTS) return false;
  const report = buildReport(kind, err);
  const key = `${report.kind}|${report.message}`;
  if (seen.has(key)) return false;
  seen.add(key);
  sent += 1;
  try {
    send(report);
  } catch {
    /* never let reporting throw */
  }
  return true;
}

function post(report: ClientErrorReport): void {
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

/** Install global handlers (once). Ignores errors from other origins (extensions, injected scripts). */
export function installErrorReporting(): void {
  if (typeof window === "undefined" || (window as { __mdaiReporting?: boolean }).__mdaiReporting) return;
  (window as { __mdaiReporting?: boolean }).__mdaiReporting = true;
  window.addEventListener("error", (ev) => {
    if (ev.filename && !ev.filename.startsWith(location.origin)) return;
    reportError("error", ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r: unknown = ev.reason;
    // Handled API failures surface in the UI already; only report real bugs.
    if (r && typeof r === "object" && (r as { name?: string }).name === "AppError") return;
    reportError("unhandledrejection", r);
  });
}

/** Test helper. */
export function _resetReporting(): void {
  sent = 0;
  seen.clear();
}
