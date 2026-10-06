import { DEFAULT_GEMINI_MODEL, GEMINI_SERVER_MODELS } from "../../../src/lib/gemini-models.js";
import { GEMINI, call } from "./adapters.js";
import { geminiKeys, withGeminiFailover } from "./gemini-pool.js";

/**
 * Which Gemini model ids the configured keys can actually call, from Google's official
 * `models.list` endpoint (no generation quota is spent). Cached for 10 minutes per instance;
 * a failed lookup is remembered for 1 minute so an outage doesn't add latency to every step.
 * A model-not-found response from generateContent invalidates the cache.
 */

export const MODEL_CACHE_TTL_MS = 10 * 60_000;
const NEGATIVE_TTL_MS = 60_000;
const LIST_TIMEOUT_MS = 8_000;

type Cache = { at: number; models: Set<string> | null };
let cache: Cache | null = null;
let inflight: Promise<Set<string> | null> | null = null;

type ListPage = { models?: { name?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };

/** One key's generateContent-capable models (ids without the `models/` prefix). */
export async function listGeminiModels(apiKey: string, timeoutMs = LIST_TIMEOUT_MS, signal?: AbortSignal): Promise<Set<string>> {
  const out = new Set<string>();
  let token = "";
  for (let page = 0; page < 3; page++) {
    const url = `${GEMINI}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
    const data = (await call("Gemini", url, { headers: { "x-goog-api-key": apiKey }, timeoutMs, signal })) as ListPage;
    for (const m of data?.models ?? []) {
      const id = m.name?.replace(/^models\//, "");
      if (id && m.supportedGenerationMethods?.includes("generateContent")) out.add(id);
    }
    token = data?.nextPageToken ?? "";
    if (!token) break;
  }
  return out;
}

export async function discoverGeminiModels(opts: { force?: boolean; now?: () => number; env?: Record<string, string | undefined> } = {}): Promise<Set<string> | null> {
  const now = opts.now ?? Date.now;
  const t = now();
  if (!opts.force && cache && t - cache.at < (cache.models ? MODEL_CACHE_TTL_MS : NEGATIVE_TTL_MS)) return cache.models;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { value } = await withGeminiFailover({ model: "models.list", env: opts.env, budgetMs: 20_000, perAttemptMs: LIST_TIMEOUT_MS }, ({ apiKey, timeoutMs }) => listGeminiModels(apiKey, timeoutMs));
      cache = { at: now(), models: value.size ? value : null };
    } catch {
      cache = { at: now(), models: null };
    }
    return cache.models;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Last known list without fetching (null = unknown / not checked yet). */
export function peekGeminiModels(): Set<string> | null {
  return cache?.models ?? null;
}

/** Selector entries: every Chrono-supported id, marked by what Google currently lists. */
export function geminiModelOptions(): { id: string; available: boolean }[] {
  const listed = peekGeminiModels();
  return GEMINI_SERVER_MODELS.map((id) => ({ id, available: listed ? listed.has(id) : true }));
}

export function invalidateGeminiModels(): void {
  cache = null;
}

/** The model to use instead when `selected` isn't callable. Never invents an id. */
export function fallbackModel(available: Set<string> | null): string {
  if (!available || available.has(DEFAULT_GEMINI_MODEL)) return DEFAULT_GEMINI_MODEL;
  return GEMINI_SERVER_MODELS.find((m) => available.has(m) && /flash/.test(m) && !/lite/.test(m)) ?? GEMINI_SERVER_MODELS.find((m) => available.has(m)) ?? DEFAULT_GEMINI_MODEL;
}

/**
 * Keep the user's selection when Google lists it; otherwise fall back. When the list can't be
 * fetched, keep the selection — the generateContent call itself is the final authority.
 */
export async function chooseGeminiModel(selected: string, env?: Record<string, string | undefined>): Promise<{ model: string; fallbackFrom: string | null }> {
  if (!geminiKeys(env).length) return { model: selected, fallbackFrom: null };
  const available = await discoverGeminiModels({ env });
  if (!available || available.has(selected)) return { model: selected, fallbackFrom: null };
  const model = fallbackModel(available);
  return model === selected ? { model, fallbackFrom: null } : { model, fallbackFrom: selected };
}

/**
 * Per-key availability for health checks: counts only — never key values, positions or account
 * identity. Uses models.list (free) per key, sequentially, with a short timeout.
 */
export async function perKeyModelReport(env?: Record<string, string | undefined>): Promise<{ keys: number; keysOk: number; keysFailed: Record<string, number>; models: Record<string, number> }> {
  const keys = geminiKeys(env);
  const models: Record<string, number> = Object.fromEntries(GEMINI_SERVER_MODELS.map((m) => [m, 0]));
  const keysFailed: Record<string, number> = {};
  let keysOk = 0;
  for (const key of keys) {
    try {
      const list = await listGeminiModels(key, 6_000);
      keysOk++;
      for (const m of GEMINI_SERVER_MODELS) if (list.has(m)) models[m]! += 1;
    } catch (err) {
      const code = err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "UNKNOWN";
      keysFailed[code] = (keysFailed[code] ?? 0) + 1;
    }
  }
  return { keys: keys.length, keysOk, keysFailed, models };
}

/** Tests only. */
export function resetGeminiModelCache(): void {
  cache = null;
  inflight = null;
}
