/**
 * Structured, redacted JSON logs (one line per event) for Netlify function logs / log drains.
 * Never pass request bodies, headers or tokens — and even if a caller does, `redact()` masks them.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY = /token|secret|password|passwd|authorization|cookie|api[-_]?key|apikey|credential|session/i;
// GitHub tokens, OpenAI/Anthropic-style keys, Google API keys, JWT-ish strings, bearer values.
const SECRET_VALUE = /\b(gh[opsur]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b|Bearer\s+\S+/g;

export function redactString(s: string, max = 500): string {
  const out = s.replace(SECRET_VALUE, "[redacted]");
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

function threshold(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level | "silent" | "";
  if (env === "silent") return Infinity;
  if (env && env in ORDER) return ORDER[env as Level];
  // Quiet under tests unless asked.
  return process.env.VITEST ? Infinity : ORDER.info;
}

export type LogSink = (line: string, level: Level) => void;
let sink: LogSink = (line, level) => (level === "error" || level === "warn" ? console.error(line) : console.log(line));

/** For tests: capture log lines. Returns a restore function. */
export function setLogSink(next: LogSink): () => void {
  const prev = sink;
  sink = next;
  return () => {
    sink = prev;
  };
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < threshold()) return;
  const entry = { t: new Date().toISOString(), level, msg, ...(redact(fields) as Record<string, unknown>) };
  sink(JSON.stringify(entry), level);
}

export function newRequestId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
