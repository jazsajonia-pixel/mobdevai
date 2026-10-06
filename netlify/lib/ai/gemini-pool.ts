import { HttpError } from "../http.js";
import { log } from "../log.js";
import { upstreamOf } from "./adapters.js";

/**
 * Server-side Gemini key pool with fast, bounded failover.
 *
 * Rules (see docs/ARCHITECTURE.md → "Gemini key pool"):
 *  - A request starts on ONE key and only moves to another key after that key returns an error
 *    that a different key could plausibly fix (quota/rate limit, quota-flavoured 403, invalid or
 *    disabled key, transient 5xx/408/timeout). Each key is tried at most once per request.
 *  - Request-level problems (bad prompt, unsupported model, oversized input, safety block, client
 *    abort) are returned immediately — another key would fail the same way and burn quota.
 *  - Cooldowns are in-memory HINTS for this instance only. They are short and bounded, never
 *    awaited, and correctness does not depend on them: a cold instance simply tries keys in order
 *    and moves on when one is limited.
 *  - Quotas are per Google project AND per model, so cooldowns are tracked per key+model.
 *  - Key values never leave this module except as the argument to the provider call. Slots are
 *    identified by position only (no key suffixes) in logs and metadata.
 */

type SlotState = { invalidUntil: number; inFlight: number };
const slots = new Map<string, SlotState>();
/** `${slot}|${model}` → epoch ms when the key may be used again for that model. */
const cooldowns = new Map<string, number>();

export const POOL_LIMITS = {
  /** Hard cap on key attempts per request (protects against request amplification). */
  maxAttempts: 8,
  /**
   * 5xx/timeouts are usually model-wide (e.g. "model is overloaded"), so every key fails the same
   * way and slowly. Try one more key, then return 503 + Retry-After and let the client re-send.
   */
  maxTransientFailures: 2,
  /** Total wall-clock budget for all attempts in one request. */
  budgetMs: 100_000,
  /** Don't start a new attempt with less than this left — it can't finish in time. */
  minAttemptMs: 8_000,
  defaultQuotaCooldownMs: 15_000,
  transientCooldownMs: 5_000,
  maxCooldownMs: 10 * 60_000,
  invalidKeyCooldownMs: 15 * 60_000,
} as const;

const KEY_SHAPE = /^[A-Za-z0-9_\-.]{20,200}$/;

/**
 * Reads the pool. Accepts a JSON array, or newline / comma / semicolon / whitespace separated
 * values, optionally quoted. Blank, duplicate and malformed entries are dropped. Falls back to
 * GEMINI_API_KEY when GEMINI_API_KEYS is empty or unparseable, and also merges it in (deduped)
 * so the legacy single key is never silently ignored.
 */
export function geminiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.GEMINI_API_KEYS?.trim() ?? "";
  let values: unknown[] = [];
  if (raw) {
    let parsed: unknown = undefined;
    if (raw.startsWith("[")) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
    }
    values = Array.isArray(parsed) ? parsed : raw.replace(/^\[|\]$/g, "").split(/[\s,;]+/);
  }
  const single = env.GEMINI_API_KEY?.trim();
  if (single) values.push(single);
  const clean = values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().replace(/^["']+|["']+$/g, "").trim())
    .filter((v) => KEY_SHAPE.test(v));
  return [...new Set(clean)];
}

export type FailureKind = "quota" | "transient" | "key" | "fatal";

/** Decide whether another key could succeed where this one failed. */
export function classifyGeminiError(err: unknown): FailureKind {
  if (!(err instanceof HttpError)) return "fatal";
  const up = upstreamOf(err);
  if (up?.aborted || up?.blocked) return "fatal";
  if (err.code === "AI_QUOTA_EXCEEDED") return "quota";
  if (err.code === "AI_INVALID_KEY") return "key";
  if (err.code === "AI_PROVIDER_UNAVAILABLE") {
    if (up?.timedOut) return "transient";
    const s = up?.httpStatus ?? err.status;
    return [408, 500, 502, 503, 504].includes(s) || s === null ? "transient" : "fatal";
  }
  return "fatal";
}

const slotName = (index: number) => `gemini-${index + 1}`;
const slotState = (slot: string): SlotState => {
  let s = slots.get(slot);
  if (!s) slots.set(slot, (s = { invalidUntil: 0, inFlight: 0 }));
  return s;
};
const cooldownKey = (slot: string, model: string) => `${slot}|${model}`;

function cooldownFor(kind: FailureKind, err: HttpError): number {
  const hinted = upstreamOf(err)?.retryAfterMs ?? null;
  const daily = upstreamOf(err)?.quotaIds.some((q) => /PerDay/i.test(q));
  if (kind === "quota") {
    const base = hinted ?? (daily ? POOL_LIMITS.maxCooldownMs : POOL_LIMITS.defaultQuotaCooldownMs);
    return Math.min(Math.max(base, 1_000), POOL_LIMITS.maxCooldownMs);
  }
  return Math.min(Math.max(hinted ?? POOL_LIMITS.transientCooldownMs, 1_000), 60_000);
}

export interface FailoverAttempt {
  slot: string;
  apiKey: string;
  /** Deadline for this single provider call. */
  timeoutMs: number;
  attempt: number;
}

export interface FailoverMeta {
  attempts: number;
  slot: string;
}

export interface FailoverOptions {
  model: string;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  now?: () => number;
  budgetMs?: number;
  /** Upper bound for one call (defaults to the agent timeout of 52 s). */
  perAttemptMs?: number;
}

/**
 * Runs one provider operation with failover. The operation must be a pure function of the key:
 * the caller closes over model, messages, tools and attachments, so every attempt sends exactly
 * the same request. Nothing is committed to task state until an attempt succeeds.
 */
export async function withGeminiFailover<T>(opts: FailoverOptions, operation: (a: FailoverAttempt) => Promise<T>): Promise<{ value: T; meta: FailoverMeta }> {
  const now = opts.now ?? Date.now;
  const keys = geminiKeys(opts.env);
  if (!keys.length) throw new HttpError(503, "AI_NOT_CONFIGURED", "The server has no Gemini API keys configured.");
  const started = now();
  const budget = opts.budgetMs ?? POOL_LIMITS.budgetMs;
  const perAttempt = opts.perAttemptMs ?? 52_000;
  const attempted = new Set<number>();
  const failures: { kind: FailureKind; err: HttpError }[] = [];
  let skippedCooling = 0;

  for (let attempt = 0; attempt < Math.min(POOL_LIMITS.maxAttempts, keys.length); attempt++) {
    if (opts.signal?.aborted) throw new HttpError(499, "AI_PROVIDER_UNAVAILABLE", "The request was cancelled.");
    const t = now();
    const remaining = budget - (t - started);
    if (attempt > 0 && remaining < POOL_LIMITS.minAttemptMs) break;

    // Eligible: not yet tried in this request, not known-invalid, not cooling for this model.
    const eligible = keys
      .map((key, index) => ({ key, index, slot: slotName(index) }))
      .filter(({ index }) => !attempted.has(index))
      .filter(({ slot }) => slotState(slot).invalidUntil <= t)
      .filter(({ slot }) => (cooldowns.get(cooldownKey(slot, opts.model)) ?? 0) <= t);
    if (!eligible.length) {
      skippedCooling = keys.length - attempted.size;
      break;
    }
    // Sticky primary: lowest index wins unless it is busier than another eligible key. This keeps
    // a single user on one key (no rotation without an error) while spreading concurrent bursts.
    eligible.sort((a, b) => slotState(a.slot).inFlight - slotState(b.slot).inFlight || a.index - b.index);
    const pick = eligible[0]!;
    attempted.add(pick.index);
    const state = slotState(pick.slot);
    state.inFlight += 1;
    try {
      const value = await operation({ slot: pick.slot, apiKey: pick.key, timeoutMs: Math.max(1_000, Math.min(perAttempt, remaining)), attempt });
      cooldowns.delete(cooldownKey(pick.slot, opts.model));
      if (attempt > 0) log("info", "gemini_failover_ok", { slot: pick.slot, attempts: attempt + 1, model: opts.model });
      return { value, meta: { attempts: attempt + 1, slot: pick.slot } };
    } catch (err) {
      const kind = classifyGeminiError(err);
      if (kind === "fatal" || !(err instanceof HttpError)) throw err;
      if (opts.signal?.aborted) throw err;
      failures.push({ kind, err });
      const at = now();
      if (kind === "key") state.invalidUntil = at + POOL_LIMITS.invalidKeyCooldownMs;
      else cooldowns.set(cooldownKey(pick.slot, opts.model), at + cooldownFor(kind, err));
      if (failures.filter((f) => f.kind === "transient").length >= POOL_LIMITS.maxTransientFailures) {
        log("warn", "gemini_key_failed", { slot: pick.slot, kind, status: upstreamOf(err)?.httpStatus ?? err.status, model: opts.model, attempt: attempt + 1 });
        break;
      }
      log("warn", "gemini_key_failed", { slot: pick.slot, kind, status: upstreamOf(err)?.httpStatus ?? err.status, model: opts.model, attempt: attempt + 1 });
    } finally {
      state.inFlight = Math.max(0, state.inFlight - 1);
    }
  }
  throw exhaustedError(keys, opts.model, failures, attempted.size, skippedCooling, now());
}

/** Earliest moment any non-invalid key becomes usable for this model again. */
function earliestRetryMs(keys: string[], model: string, at: number): number {
  let best = Infinity;
  keys.forEach((_, index) => {
    const slot = slotName(index);
    if (slotState(slot).invalidUntil > at) return;
    const until = cooldowns.get(cooldownKey(slot, model)) ?? 0;
    best = Math.min(best, Math.max(0, until - at));
  });
  return Number.isFinite(best) ? best : POOL_LIMITS.defaultQuotaCooldownMs;
}

function exhaustedError(keys: string[], model: string, failures: { kind: FailureKind; err: HttpError }[], tried: number, cooling: number, at: number): HttpError {
  const count = (k: FailureKind) => failures.filter((f) => f.kind === k).length;
  const quota = count("quota");
  const transient = count("transient");
  const invalid = count("key");
  const retrySec = String(Math.max(1, Math.min(600, Math.ceil(earliestRetryMs(keys, model, at) / 1000))));
  const summary = `Tried ${tried} of ${keys.length} server Gemini key${keys.length === 1 ? "" : "s"}${cooling ? ` (${cooling} cooling down)` : ""}`;
  const allInvalid = keys.every((_, i) => slotState(slotName(i)).invalidUntil > at);
  if (allInvalid) return new HttpError(503, "AI_INVALID_KEY", `${summary}; none were accepted by Google. The server's Gemini keys need to be replaced.`);
  if (!quota && !cooling && transient) {
    return new HttpError(503, "AI_PROVIDER_UNAVAILABLE", `${summary}; Gemini is temporarily unavailable. Try again shortly.`, [], { "Retry-After": retrySec });
  }
  const parts = [quota && `${quota} rate-limited`, transient && `${transient} unavailable`, invalid && `${invalid} rejected`].filter(Boolean).join(", ");
  return new HttpError(429, "AI_QUOTA_EXCEEDED", `${summary}${parts ? `: ${parts}` : ""}. Every eligible key is temporarily rate-limited for ${model}; retry in about ${retrySec}s.`, [], { "Retry-After": retrySec });
}

/** Counts only — safe for health checks. */
export function geminiPoolInfo(model?: string, env?: Record<string, string | undefined>): { configured: number; invalid: number; cooling: number } {
  const keys = geminiKeys(env);
  const t = Date.now();
  let invalid = 0;
  let cooling = 0;
  keys.forEach((_, i) => {
    const slot = slotName(i);
    if (slotState(slot).invalidUntil > t) invalid++;
    else if (model && (cooldowns.get(cooldownKey(slot, model)) ?? 0) > t) cooling++;
  });
  return { configured: keys.length, invalid, cooling };
}

/** Tests only. */
export function resetGeminiPool(): void {
  slots.clear();
  cooldowns.clear();
}
