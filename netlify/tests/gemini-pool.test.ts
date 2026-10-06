import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/http";
import { ProviderError, call, isQuotaForbidden, parseRetryDelay, upstreamInfo } from "../lib/ai/adapters";
import { POOL_LIMITS, classifyGeminiError, geminiKeys, geminiPoolInfo, resetGeminiPool, withGeminiFailover } from "../lib/ai/gemini-pool";
import { MODEL_CACHE_TTL_MS, chooseGeminiModel, discoverGeminiModels, fallbackModel, resetGeminiModelCache } from "../lib/ai/gemini-availability";
import { agentStep } from "../lib/ai/agent-step";
import { gh, mockGitHub } from "./helpers";

/** Test doubles only — no real Gemini traffic. Keys are fake but key-shaped. */
const K = (n: number) => `AIzaTESTKEY_never_leak_${String(n).padStart(16, "0")}`;
const env = (...keys: string[]) => ({ GEMINI_API_KEYS: JSON.stringify(keys) });
const MODEL = "gemini-flash-latest";

const quota = (retry?: string) =>
  new ProviderError(429, "AI_QUOTA_EXCEEDED", "Gemini rate limit or quota reached.", { httpStatus: 429, providerStatus: "RESOURCE_EXHAUSTED", reasons: [], quotaIds: [], retryAfterMs: retry ? parseRetryDelay(retry) : null });
const invalidKey = () => new ProviderError(400, "AI_INVALID_KEY", "Gemini rejected the API key.", { httpStatus: 400, providerStatus: "INVALID_ARGUMENT", reasons: ["API_KEY_INVALID"], quotaIds: [], retryAfterMs: null });
const unavailable = (s = 503) => new ProviderError(502, "AI_PROVIDER_UNAVAILABLE", `Gemini returned an error (${s}).`, { httpStatus: s, providerStatus: "UNAVAILABLE", reasons: [], quotaIds: [], retryAfterMs: null });

beforeEach(() => {
  resetGeminiPool();
  resetGeminiModelCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("geminiKeys parsing", () => {
  it("accepts a JSON array", () => {
    expect(geminiKeys(env(K(1), K(2)))).toEqual([K(1), K(2)]);
  });
  it("accepts newline, comma, semicolon and whitespace separated values (optionally quoted)", () => {
    expect(geminiKeys({ GEMINI_API_KEYS: `${K(1)}\n${K(2)}\r\n${K(3)}` })).toEqual([K(1), K(2), K(3)]);
    expect(geminiKeys({ GEMINI_API_KEYS: `${K(1)}, ${K(2)};${K(3)}` })).toEqual([K(1), K(2), K(3)]);
    expect(geminiKeys({ GEMINI_API_KEYS: `"${K(1)}", '${K(2)}'` })).toEqual([K(1), K(2)]);
  });
  it("drops duplicates, blanks, whitespace and malformed entries", () => {
    expect(geminiKeys({ GEMINI_API_KEYS: JSON.stringify([` ${K(1)} `, K(1), "", "   ", "short", 42, null, { k: K(9) }, K(2)]) })).toEqual([K(1), K(2)]);
    expect(geminiKeys({ GEMINI_API_KEYS: `\n\n${K(1)}\n\n${K(1)}\n` })).toEqual([K(1)]);
    expect(geminiKeys({ GEMINI_API_KEYS: "has spaces inside? no!!" })).toEqual([]);
  });
  it("recovers from malformed JSON instead of losing the whole pool", () => {
    expect(geminiKeys({ GEMINI_API_KEYS: `["${K(1)}", "${K(2)}"` })).toEqual([K(1), K(2)]);
  });
  it("merges the legacy GEMINI_API_KEY (deduped) and falls back to it alone", () => {
    expect(geminiKeys({ GEMINI_API_KEYS: JSON.stringify([K(1)]), GEMINI_API_KEY: K(2) })).toEqual([K(1), K(2)]);
    expect(geminiKeys({ GEMINI_API_KEYS: JSON.stringify([K(1)]), GEMINI_API_KEY: K(1) })).toEqual([K(1)]);
    expect(geminiKeys({ GEMINI_API_KEY: K(3) })).toEqual([K(3)]);
    expect(geminiKeys({})).toEqual([]);
  });
});

describe("error classification", () => {
  it("treats only quota-flavoured 403s as quota", () => {
    const info = (body: unknown) => upstreamInfo(403, body as never, null);
    expect(isQuotaForbidden(info({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }), "Quota exceeded")).toBe(true);
    expect(isQuotaForbidden(info({ error: { status: "PERMISSION_DENIED", details: [{ reason: "RATE_LIMIT_EXCEEDED" }] } }), "")).toBe(true);
    expect(isQuotaForbidden(info({ error: { status: "PERMISSION_DENIED", message: "Quota exceeded for quota metric 'Generate requests'" } }), "Quota exceeded for quota metric 'Generate requests'")).toBe(true);
    expect(isQuotaForbidden(info({ error: { status: "PERMISSION_DENIED", message: "Permission denied" } }), "Permission denied")).toBe(false);
    expect(isQuotaForbidden(info({ error: { status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }], message: "API has not been used; quota project" } }), "API has not been used; quota project")).toBe(false);
    expect(isQuotaForbidden(info({ error: { status: "PERMISSION_DENIED", message: "Your API key was reported as leaked." } }), "Your API key was reported as leaked.")).toBe(false);
  });

  it("maps real Gemini error bodies to codes that drive failover", async () => {
    const cases: [number, unknown, string, string][] = [
      [429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" }] } }, "AI_QUOTA_EXCEEDED", "quota"],
      [403, { error: { code: 403, status: "PERMISSION_DENIED", message: "Quota exceeded for this project", details: [{ reason: "RATE_LIMIT_EXCEEDED" }] } }, "AI_QUOTA_EXCEEDED", "quota"],
      [403, { error: { code: 403, status: "PERMISSION_DENIED", message: "Method doesn't allow unregistered callers" } }, "AI_INVALID_KEY", "key"],
      [400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }, "AI_INVALID_KEY", "key"],
      [401, { error: { code: 401, status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." } }, "AI_INVALID_KEY", "key"],
      [408, { error: { code: 408, message: "Request timeout" } }, "AI_PROVIDER_UNAVAILABLE", "transient"],
      [500, { error: { code: 500, status: "INTERNAL", message: "An internal error has occurred." } }, "AI_PROVIDER_UNAVAILABLE", "transient"],
      [502, null, "AI_PROVIDER_UNAVAILABLE", "transient"],
      [503, { error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } }, "AI_PROVIDER_UNAVAILABLE", "transient"],
      [504, { error: { code: 504, status: "DEADLINE_EXCEEDED", message: "Deadline exceeded" } }, "AI_PROVIDER_UNAVAILABLE", "transient"],
      [404, { error: { code: 404, status: "NOT_FOUND", message: "models/gemini-9-flash is not found for API version v1beta" } }, "AI_MODEL_NOT_FOUND", "fatal"],
      [400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "The input token count (1200000) exceeds the maximum number of tokens allowed (1048576)." } }, "VALIDATION_FAILED", "fatal"],
      [400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid JSON payload received." } }, "VALIDATION_FAILED", "fatal"],
    ];
    for (const [status, body, code, kind] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body === null ? "" : JSON.stringify(body), { status })));
      const err = await call("Gemini", "https://generativelanguage.googleapis.com/v1beta/models", {}).catch((e: unknown) => e);
      expect(err, `${status}`).toBeInstanceOf(HttpError);
      expect((err as HttpError).code, `${status} ${JSON.stringify(body)}`).toBe(code);
      expect(classifyGeminiError(err), `${status} ${JSON.stringify(body)}`).toBe(kind);
      expect((err as HttpError).message).not.toContain("AIza");
    }
  });

  it("preserves the retry delay from RetryInfo or Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "3.6s" }] } }), { status: 429 })));
    const a = (await call("Gemini", "https://x.example/v1beta/m", {}).catch((e: unknown) => e)) as ProviderError;
    expect(a.upstream.retryAfterMs).toBe(3600);
    expect(a.headers["Retry-After"]).toBe("4");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } })));
    const b = (await call("Gemini", "https://x.example/v1beta/m", {}).catch((e: unknown) => e)) as ProviderError;
    expect(b.upstream.retryAfterMs).toBe(12_000);
  });

  it("never fails over on safety blocks or client aborts", async () => {
    mockGitHub({ "POST /v1beta/models/gemini-flash-latest:generateContent": () => gh({ promptFeedback: { blockReason: "SAFETY" } }) });
    const err = await agentStep({ kind: "gemini", model: MODEL, effort: "medium", baseUrl: null, apiKey: K(1) }, { system: "s", messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 10 }).catch((e: unknown) => e);
    expect((err as HttpError).code).toBe("VALIDATION_FAILED");
    expect(classifyGeminiError(err)).toBe("fatal");

    const ctrl = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_u: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const p = call("Gemini", "https://x.example/v1beta/m", { signal: ctrl.signal });
    ctrl.abort();
    expect(classifyGeminiError(await p.catch((e: unknown) => e))).toBe("fatal");
  });
});

describe("withGeminiFailover", () => {
  it("uses one key when it works (no rotation before an error)", async () => {
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async ({ apiKey }) => void seen.push(apiKey));
    expect(seen).toEqual([K(1), K(1), K(1)]);
  });

  it("fails over immediately on quota errors without waiting for the cooldown", async () => {
    const seen: string[] = [];
    const started = Date.now();
    const { value, meta } = await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async ({ apiKey }) => {
      seen.push(apiKey);
      if (apiKey !== K(3)) throw quota("30s");
      return "ok";
    });
    expect(value).toBe("ok");
    expect(seen).toEqual([K(1), K(2), K(3)]);
    expect(meta.attempts).toBe(3);
    expect(Date.now() - started).toBeLessThan(500);
    // Next request skips the two cooling keys and goes straight to the healthy one.
    seen.length = 0;
    await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async ({ apiKey }) => void seen.push(apiKey));
    expect(seen).toEqual([K(3)]);
  });

  it("tries every key — not just the first four — when the pool is larger", async () => {
    const keys = [1, 2, 3, 4, 5].map(K);
    const seen: string[] = [];
    const { value } = await withGeminiFailover({ model: MODEL, env: env(...keys) }, async ({ apiKey }) => {
      seen.push(apiKey);
      if (apiKey !== K(5)) throw quota();
      return 5;
    });
    expect(value).toBe(5);
    expect(seen).toEqual(keys);
  });

  it("cooldowns are per model: a key limited on one model still serves another", async () => {
    await withGeminiFailover({ model: "gemini-3.8-flash", env: env(K(1), K(2)) }, async ({ apiKey }) => {
      if (apiKey === K(1)) throw quota("60s");
    });
    const seen: string[] = [];
    await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)) }, async ({ apiKey }) => void seen.push(apiKey));
    expect(seen).toEqual([K(1)]);
  });

  it("skips invalid keys and remembers them", async () => {
    const seen: string[] = [];
    await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)) }, async ({ apiKey }) => {
      seen.push(apiKey);
      if (apiKey === K(1)) throw invalidKey();
    });
    await withGeminiFailover({ model: "gemini-2.5-flash", env: env(K(1), K(2)) }, async ({ apiKey }) => void seen.push(apiKey));
    expect(seen).toEqual([K(1), K(2), K(2)]);
    expect(geminiPoolInfo(MODEL, env(K(1), K(2)))).toMatchObject({ configured: 2, invalid: 1 });
  });

  it("does not fail over for request problems (bad prompt, unknown model, oversized input, safety block)", async () => {
    const errors = [
      new ProviderError(400, "VALIDATION_FAILED", "bad", { httpStatus: 400, providerStatus: "INVALID_ARGUMENT", reasons: [], quotaIds: [], retryAfterMs: null }),
      new ProviderError(400, "AI_MODEL_NOT_FOUND", "nf", { httpStatus: 404, providerStatus: "NOT_FOUND", reasons: [], quotaIds: [], retryAfterMs: null }),
      new ProviderError(413, "VALIDATION_FAILED", "big", { httpStatus: 400, providerStatus: "INVALID_ARGUMENT", reasons: [], quotaIds: [], retryAfterMs: null }),
      new ProviderError(422, "VALIDATION_FAILED", "blocked", { httpStatus: 200, providerStatus: "SAFETY", reasons: [], quotaIds: [], retryAfterMs: null, blocked: true }),
    ];
    for (const e of errors) {
      let n = 0;
      const got = await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async () => {
        n++;
        throw e;
      }).catch((x: unknown) => x);
      expect(got).toBe(e);
      expect(n).toBe(1);
    }
  });

  it("fails over on transient 5xx and timeouts", async () => {
    const seen: string[] = [];
    await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async ({ apiKey }) => {
      seen.push(apiKey);
      if (apiKey === K(1)) throw unavailable(503);
      if (apiKey === K(2)) throw new ProviderError(504, "AI_PROVIDER_UNAVAILABLE", "timed out", { httpStatus: null, providerStatus: null, reasons: [], quotaIds: [], retryAfterMs: null, timedOut: true });
    });
    expect(seen).toEqual([K(1), K(2), K(3)]);
  });

  it("returns a safe 429 with the earliest Retry-After when every key is limited", async () => {
    const err = (await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)) }, async ({ apiKey }) => {
      throw quota(apiKey === K(1) ? "40s" : "7s");
    }).catch((e: unknown) => e)) as HttpError;
    expect(err.status).toBe(429);
    expect(err.code).toBe("AI_QUOTA_EXCEEDED");
    expect(Number(err.headers["Retry-After"])).toBeGreaterThanOrEqual(6);
    expect(Number(err.headers["Retry-After"])).toBeLessThanOrEqual(7);
    expect(err.message).toMatch(/Tried 2 of 2/);
    expect(err.message).not.toContain("AIza");
    // While all keys cool, the next request fails fast without calling Gemini at all.
    let n = 0;
    const again = (await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)) }, async () => void n++).catch((e: unknown) => e)) as HttpError;
    expect(n).toBe(0);
    expect(again.status).toBe(429);
    expect(again.message).toMatch(/cooling down/);
  });

  it("bounds cooldowns and attempts", async () => {
    const keys = Array.from({ length: 12 }, (_, i) => K(i + 1));
    let n = 0;
    const err = (await withGeminiFailover({ model: MODEL, env: env(...keys) }, async () => {
      n++;
      throw quota("99999s");
    }).catch((e: unknown) => e)) as HttpError;
    expect(n).toBe(POOL_LIMITS.maxAttempts);
    expect(Number(err.headers["Retry-After"])).toBeLessThanOrEqual(600);
  });

  it("stops starting new attempts when the request budget is spent", async () => {
    let t = 0;
    let n = 0;
    const err = await withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)), now: () => t, budgetMs: 60_000 }, async ({ timeoutMs }) => {
      n++;
      expect(timeoutMs).toBeLessThanOrEqual(60_000 - t);
      t += 55_000; // a slow timeout on the first key
      throw unavailable(504);
    }).catch((e: unknown) => e);
    expect(n).toBe(1);
    expect((err as HttpError).code).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("reports all-invalid pools distinctly", async () => {
    const err = (await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)) }, async () => {
      throw invalidKey();
    }).catch((e: unknown) => e)) as HttpError;
    expect(err.code).toBe("AI_INVALID_KEY");
    expect(err.status).toBe(503);
  });

  it("spreads concurrent requests and never repeats a key within one request", async () => {
    const perRequest: string[][] = [[], [], []];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = (i: number) =>
      withGeminiFailover({ model: MODEL, env: env(K(1), K(2), K(3)) }, async ({ apiKey }) => {
        perRequest[i]!.push(apiKey);
        await gate;
        if (apiKey === K(1)) throw quota();
        return apiKey;
      });
    const all = Promise.all([run(0), run(1), run(2)]);
    await new Promise((r) => setTimeout(r, 10));
    expect(perRequest.map((r) => r[0])).toEqual([K(1), K(2), K(3)]);
    release();
    const results = await all;
    expect(results.map((r) => r.value)).toEqual([K(2), K(2), K(3)]);
    for (const keys of perRequest) expect(new Set(keys).size).toBe(keys.length);
  });

  it("stops immediately when the client disconnects", async () => {
    const ctrl = new AbortController();
    let n = 0;
    const err = await withGeminiFailover({ model: MODEL, env: env(K(1), K(2)), signal: ctrl.signal }, async () => {
      n++;
      ctrl.abort();
      throw unavailable(503);
    }).catch((e: unknown) => e);
    expect(n).toBe(1);
    expect(err).toBeInstanceOf(HttpError);
  });
});

describe("model availability", () => {
  const list = (ids: string[]) => gh({ models: ids.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ["generateContent", "countTokens"] })).concat([{ name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }]) });

  it("discovers models via models.list and caches for 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    const calls = mockGitHub({ "GET /v1beta/models": () => list(["gemini-flash-latest", "gemini-2.5-flash"]) });
    const e = env(K(1));
    const a = await discoverGeminiModels({ env: e });
    expect([...a!]).toEqual(["gemini-flash-latest", "gemini-2.5-flash"]);
    await discoverGeminiModels({ env: e });
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0]!.init!.headers).get("x-goog-api-key")).toBe(K(1));
    expect(calls[0]!.url.search).not.toContain("AIza");
    vi.setSystemTime(Date.now() + MODEL_CACHE_TTL_MS + 1);
    await discoverGeminiModels({ env: e });
    expect(calls).toHaveLength(2);
  });

  it("keeps an available selection and falls back to gemini-flash-latest otherwise", async () => {
    mockGitHub({ "GET /v1beta/models": () => list(["gemini-flash-latest", "gemini-2.5-flash"]) });
    expect(await chooseGeminiModel("gemini-2.5-flash", env(K(1)))).toEqual({ model: "gemini-2.5-flash", fallbackFrom: null });
    expect(await chooseGeminiModel("gemini-3.8-flash", env(K(1)))).toEqual({ model: "gemini-flash-latest", fallbackFrom: "gemini-3.8-flash" });
  });

  it("falls back to an available Flash model only when the alias itself is gone", () => {
    expect(fallbackModel(new Set(["gemini-2.5-flash-lite", "gemini-2.5-flash"]))).toBe("gemini-2.5-flash");
    expect(fallbackModel(null)).toBe("gemini-flash-latest");
  });

  it("keeps the selection when the list can't be fetched", async () => {
    mockGitHub({ "GET /v1beta/models": () => gh({ error: { status: "UNAVAILABLE" } }, { status: 503 }) });
    expect(await chooseGeminiModel("gemini-2.5-flash", env(K(1)))).toEqual({ model: "gemini-2.5-flash", fallbackFrom: null });
  });
});
