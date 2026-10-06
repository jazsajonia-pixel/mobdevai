import { HttpError } from "../http.js";
import type { ResolvedProvider } from "./adapters.js";

type KeyState = { unavailableUntil: number; invalid: boolean };
const states = new Map<string, KeyState>();
const MAX_ATTEMPTS = 4;
const DEFAULT_COOLDOWN_MS = 10_000;
const INVALID_COOLDOWN_MS = 15 * 60_000;

function slotId(key: string, index: number): string {
  return `gemini-${index + 1}-${key.slice(-6)}`;
}

/** Reads the pool without ever returning it to client-facing code. */
export function geminiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.GEMINI_API_KEYS?.trim();
  let values: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) values = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      values = raw.split(/[\n,]/);
    }
  }
  if (!values.length && env.GEMINI_API_KEY?.trim()) values = [env.GEMINI_API_KEY];
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function isTransient(err: unknown): err is HttpError {
  return err instanceof HttpError && (err.code === "AI_QUOTA_EXCEEDED" || (err.code === "AI_PROVIDER_UNAVAILABLE" && [502, 503, 504].includes(err.status)));
}

function cooldown(err: HttpError): number {
  const retryAfter = Number(err.headers["Retry-After"] ?? "");
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10 * 60_000) : DEFAULT_COOLDOWN_MS;
}

function safeRetryError(keys: string[], now = Date.now()): HttpError {
  const availableAt = keys.reduce((min, key, index) => Math.min(min, states.get(slotId(key, index))?.unavailableUntil || now), Infinity);
  const wait = Number.isFinite(availableAt) ? Math.max(1, Math.ceil((availableAt - now) / 1000)) : 10;
  return new HttpError(429, "AI_QUOTA_EXCEEDED", "All configured Gemini keys are temporarily rate-limited or unavailable. Try again shortly.", [], { "Retry-After": String(wait) });
}

/**
 * Runs exactly one provider operation, failing over only for transient Gemini failures.
 * The caller supplies the operation so model, messages, and task state remain unchanged.
 */
export async function withGeminiFailover<T>(provider: ResolvedProvider, operation: (apiKey: string, slot: string) => Promise<T>): Promise<T> {
  const keys = geminiKeys();
  if (!keys.length) throw new HttpError(503, "AI_NOT_CONFIGURED", "The server has no Gemini API keys configured.");
  const attempted = new Set<number>();
  let last: unknown = null;
  for (let attempt = 0; attempt < Math.min(MAX_ATTEMPTS, keys.length); attempt++) {
    const now = Date.now();
    const candidates = keys
      .map((key, index) => ({ key, index, state: states.get(slotId(key, index)) }))
      .filter(({ index, state }) => !attempted.has(index) && !state?.invalid && (!state?.unavailableUntil || state.unavailableUntil <= now));
    const candidate = candidates[0] ?? keys.map((key, index) => ({ key, index, state: states.get(slotId(key, index)) })).filter(({ index }) => !attempted.has(index)).sort((a, b) => (a.state?.unavailableUntil ?? 0) - (b.state?.unavailableUntil ?? 0))[0];
    if (!candidate) break;
    attempted.add(candidate.index);
    const slot = slotId(candidate.key, candidate.index);
    try {
      const result = await operation(candidate.key, slot);
      states.set(slot, { unavailableUntil: 0, invalid: false });
      return result;
    } catch (err) {
      last = err;
      if (err instanceof HttpError && err.code === "AI_INVALID_KEY") {
        states.set(slot, { unavailableUntil: Date.now() + INVALID_COOLDOWN_MS, invalid: true });
        continue;
      }
      if (!isTransient(err)) {
        throw err;
      }
      states.set(slot, { unavailableUntil: Date.now() + cooldown(err), invalid: false });
    }
  }
  if (last instanceof HttpError && last.code === "AI_PROVIDER_UNAVAILABLE" && last.status !== 429) throw last;
  throw safeRetryError(keys);
}

export function geminiPoolInfo(): { configured: number; unavailable: number } {
  const keys = geminiKeys();
  const now = Date.now();
  return { configured: keys.length, unavailable: keys.filter((key, index) => (states.get(slotId(key, index))?.unavailableUntil ?? 0) > now).length };
}
