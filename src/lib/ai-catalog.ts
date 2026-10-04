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
    defaultModel: "gpt-6.1-sol",
    suggestedModels: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"],
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
  },
  anthropic: {
    kind: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-sonnet-5-5",
    suggestedModels: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"],
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
    needsBaseUrl: false,
  },
  gemini: {
    kind: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-3.8-flash",
    suggestedModels: ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.5-flash-lite"],
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
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
