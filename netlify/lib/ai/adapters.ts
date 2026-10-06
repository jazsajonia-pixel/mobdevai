import { PROVIDERS } from "../../../src/lib/ai-catalog.js";
import type { ProviderKind } from "../../../src/types/ai.js";
import { HttpError } from "../http.js";
import { assertPublicHost, normalizeBaseUrl } from "./url-guard.js";

/**
 * Provider abstraction. Every provider implements the same small surface so the agent (Phase 4)
 * isn't tied to one vendor. Keys are passed in per call and never logged or returned.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  stopReason: string | null;
}

export interface ResolvedProvider {
  kind: ProviderKind;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl: string | null;
  apiKey: string;
}

export interface ProviderAdapter {
  chat(p: ResolvedProvider, req: ChatRequest): Promise<ChatResult>;
  listModels(p: ResolvedProvider): Promise<string[] | null>;
}

const TIMEOUT_MS = 30_000;
/** Agent steps can generate whole files; Netlify's synchronous limit is 60 s. */
export const AGENT_TIMEOUT_MS = 52_000;

/** Upstream messages can echo key fragments — strip anything token-like before showing it. */
export function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9_\-]{20,}/g, "[redacted]")
    .replace(/(sk|AIza|key)[-_A-Za-z0-9*.]{4,}/gi, "[redacted]")
    .slice(0, 240);
}

function upstreamError(status: number, detail: string, provider: string, retryAfter?: string | null): HttpError {
  const d = detail ? ` (${redact(detail)})` : "";
  const headers: Record<string, string> = retryAfter ? { "Retry-After": retryAfter.slice(0, 16) } : {};
  if (status === 401 || status === 403) return new HttpError(400, "AI_INVALID_KEY", `${provider} rejected the API key${d}.`);
  if (status === 404) return new HttpError(400, "AI_MODEL_NOT_FOUND", `${provider} couldn't find that model${d}.`);
  if (status === 429) return new HttpError(429, "AI_QUOTA_EXCEEDED", `${provider} rate limit or quota reached${d}.`, [], headers);
  if (status === 400 && /model/i.test(detail) && /(not|invalid|unknown|exist|support)/i.test(detail)) {
    return new HttpError(400, "AI_MODEL_NOT_FOUND", `${provider} doesn't accept that model${d}.`);
  }
  if (status === 400 && /api.?key/i.test(detail)) return new HttpError(400, "AI_INVALID_KEY", `${provider} rejected the API key${d}.`);
  if (status >= 400 && status < 500) return new HttpError(400, "VALIDATION_FAILED", `${provider} rejected the request${d}.`);
  return new HttpError(502, "AI_PROVIDER_UNAVAILABLE", `${provider} returned an error (${status}).`, [], headers);
}

export async function call(provider: string, url: string, init: RequestInit & { signal?: AbortSignal; timeoutMs?: number }): Promise<unknown> {
  const { timeoutMs = TIMEOUT_MS, ...rest } = init;
  init = rest;
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    // redirect: "manual" — a redirect could bounce the key to another host.
    res = await fetch(url, { ...init, signal, redirect: "manual" });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new HttpError(504, "AI_PROVIDER_UNAVAILABLE", timeout ? `${provider} timed out.` : `Couldn't reach ${provider}.`);
  }
  if (res.status >= 300 && res.status < 400) throw new HttpError(502, "AI_BAD_BASE_URL", `${provider} answered with a redirect; use the final API URL.`);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (res.ok) throw new HttpError(502, "AI_PROVIDER_UNAVAILABLE", `${provider} returned something that isn't JSON. Check the base URL.`);
  }
  if (!res.ok) {
    const b = body as { error?: { message?: string } | string; message?: string } | null;
    const detail = typeof b?.error === "string" ? b.error : (b?.error?.message ?? b?.message ?? "");
    throw upstreamError(res.status, detail, provider, res.headers.get("retry-after"));
  }
  return body;
}

/* ── OpenAI + OpenAI-compatible (Chat Completions) ───────────────── */

export async function openAiBase(p: ResolvedProvider): Promise<string> {
  if (p.kind === "openai") return PROVIDERS.openai.defaultBaseUrl!;
  if (p.kind === "groq") return PROVIDERS.groq.defaultBaseUrl!;
  if (!p.baseUrl) throw new HttpError(422, "AI_BAD_BASE_URL", "This provider needs a base URL.");
  const base = normalizeBaseUrl(p.baseUrl);
  await assertPublicHost(base);
  return base;
}

const openAi: ProviderAdapter = {
  async chat(p, req) {
    const name = p.kind === "openai" ? "OpenAI" : p.kind === "groq" ? "Groq" : "The provider";
    const base = await openAiBase(p);
    const messages = [...(req.system ? [{ role: "system", content: req.system }] : []), ...req.messages];
    const tokens = req.maxTokens ?? 1024;
    const body: Record<string, unknown> = { model: p.model, messages };
    // OpenAI's current models take max_completion_tokens; most compatible servers still expect max_tokens.
    if (p.kind === "openai") body.max_completion_tokens = tokens;
    else body.max_tokens = tokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (p.kind === "openai" && req.effort) body.reasoning_effort = req.effort;
    const data = (await call(name, `${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    })) as { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const choice = data?.choices?.[0];
    if (!choice) throw new HttpError(502, "AI_PROVIDER_UNAVAILABLE", `${name} returned no choices.`);
    return {
      text: choice.message?.content ?? "",
      model: data.model ?? p.model,
      usage: { inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null },
      stopReason: choice.finish_reason ?? null,
    };
  },
  async listModels(p) {
    const base = await openAiBase(p);
    try {
      const data = (await call(p.kind === "openai" ? "OpenAI" : p.kind === "groq" ? "Groq" : "The provider", `${base}/models`, { headers: { Authorization: `Bearer ${p.apiKey}` } })) as { data?: { id?: string }[] };
      return (data?.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
    } catch (err) {
      // Bad keys should fail loudly; a missing /models endpoint on a compatible server shouldn't.
      if (p.kind === "openai" || p.kind === "groq" || (err instanceof HttpError && ["AI_INVALID_KEY", "AI_QUOTA_EXCEEDED", "AI_BAD_BASE_URL"].includes(err.code))) throw err;
      return null;
    }
  },
};

/* ── Anthropic (Messages API) ─────────────────────────────────────── */

export const ANTHROPIC = PROVIDERS.anthropic.defaultBaseUrl!;
export const anthropicHeaders = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" });

const anthropic: ProviderAdapter = {
  async chat(p, req) {
    const data = (await call("Anthropic", `${ANTHROPIC}/v1/messages`, {
      method: "POST",
      headers: anthropicHeaders(p.apiKey),
      body: JSON.stringify({
        model: p.model,
        max_tokens: req.maxTokens ?? 1024,
        ...(req.system ? { system: req.system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        messages: req.messages,
      }),
      signal: req.signal,
    })) as { model?: string; content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      text: (data?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
      model: data?.model ?? p.model,
      usage: { inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null },
      stopReason: data?.stop_reason ?? null,
    };
  },
  async listModels(p) {
    const data = (await call("Anthropic", `${ANTHROPIC}/v1/models?limit=100`, { headers: anthropicHeaders(p.apiKey) })) as { data?: { id?: string }[] };
    return (data?.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
  },
};

/* ── Google Gemini (generateContent) ──────────────────────────────── */

export const GEMINI = PROVIDERS.gemini.defaultBaseUrl!;

const normalizeGeminiModel = (model: string) => model.trim().replace(/^models\//, "");
const gemini: ProviderAdapter = {
  async chat(p, req) {
    const model = normalizeGeminiModel(p.model);
    if (!/^[\w.\- ]+$/.test(model)) throw new HttpError(400, "AI_MODEL_NOT_FOUND", "Invalid Gemini model name.");
    const data = (await call("Gemini", `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // Key in a header, not the query string, so it never lands in URL logs.
      headers: { "x-goog-api-key": p.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 1024, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
      }),
      signal: req.signal,
    })) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; modelVersion?: string };
    const c = data?.candidates?.[0];
    return {
      text: (c?.content?.parts ?? []).map((x) => x.text ?? "").join(""),
      model: data?.modelVersion?.replace(/^models\//, "") ?? model,
      usage: { inputTokens: data?.usageMetadata?.promptTokenCount ?? null, outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null },
      stopReason: c?.finishReason ?? null,
    };
  },
  async listModels(p) {
    const data = (await call("Gemini", `${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": p.apiKey } })) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return (data?.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name?.replace(/^models\//, ""))
      .filter((x): x is string => !!x);
  },
};

export const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  openai: openAi,
  "openai-compatible": openAi,
  anthropic,
  gemini,
  groq: openAi,
};

export function adapterFor(kind: ProviderKind): ProviderAdapter {
  return ADAPTERS[kind];
}

/**
 * Connection test: list models (validates the key, cheap), then a tiny generation to prove the
 * chosen model works. Costs a handful of tokens.
 */
export async function testProvider(p: ResolvedProvider): Promise<{ latencyMs: number; model: string; models: string[]; modelListed: boolean | null }> {
  const adapter = adapterFor(p.kind);
  const started = Date.now();
  const models = await adapter.listModels(p);
  await adapter.chat(p, { messages: [{ role: "user", content: "Reply with: ok" }], maxTokens: 16 });
  const list = (models ?? []).sort((a, b) => a.localeCompare(b)).slice(0, 300);
  return { latencyMs: Date.now() - started, model: p.model, models: list, modelListed: models ? models.includes(p.model) : null };
}
