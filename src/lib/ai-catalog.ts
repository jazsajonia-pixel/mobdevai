import type { ProviderKind } from "../types/ai";

/**
 * Provider catalog shared by client and server. Suggested models were current at build time
 * (Oct 2026); "Fetch models" in Settings lists what the user's key can actually use.
 */
export interface ProviderMeta {
  kind: ProviderKind;
  name: string;
  defaultModel: string;
  suggestedModels: string[];
  keyPlaceholder: string;
  keyUrl: string | null;
  defaultBaseUrl: string | null;
  needsBaseUrl: boolean;
}

export const PROVIDERS: Record<ProviderKind, ProviderMeta> = {
  openai: {
    kind: "openai",
    name: "OpenAI",
    defaultModel: "Chrono 1.3",
    suggestedModels: ["Chrono 1.0", "Chrono 1.1", "Chrono 1.2", "Chrono 1.3"],
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
  },
  anthropic: {
    kind: "anthropic",
    name: "Anthropic",
    defaultModel: "Claude 3.N",
    suggestedModels: ["Claude 3.N", "Claude 3.N Opus", "Claude 3.N Haiku"],
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
    needsBaseUrl: false,
  },
  gemini: {
    kind: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    needsBaseUrl: false,
  },
  groq: {
    kind: "groq",
    name: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "meta-llama/llama-4-scout-17b-16e-instruct"],
    keyPlaceholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    needsBaseUrl: false,
  },
  "openai-compatible": {
    kind: "openai-compatible",
    name: "OpenAI-compatible",
    defaultModel: "",
    suggestedModels: [],
    keyPlaceholder: "API key",
    keyUrl: null,
    defaultBaseUrl: null,
    needsBaseUrl: true,
  },
};

export const PROVIDER_KINDS = Object.keys(PROVIDERS) as ProviderKind[];

/** "sk-proj-abc…wxyz" → "sk-…wxyz". Shows a recognisable prefix and the last 4 characters only. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "••••";
  const prefix = /^(sk-ant-|sk-|AIza|gsk_|xai-)/.exec(k)?.[1] ?? "";
  return `${prefix}…${k.slice(-4)}`;
}
