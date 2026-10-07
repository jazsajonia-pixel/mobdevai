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
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
  },
  anthropic: {
    kind: "anthropic",
    name: "Anthropic",
    defaultModel: "claude-3-5-sonnet-latest",
    suggestedModels: ["claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com",
    needsBaseUrl: false,
  },
  gemini: {
    kind: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-flash-latest",
    suggestedModels: ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    needsBaseUrl: false,
  },
  openrouter: {
    kind: "openrouter",
    name: "OpenRouter",
    defaultModel: "nvidia/nemotron-3-ultra:free",
    suggestedModels: [
      "nvidia/nemotron-3-ultra:free",
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super:free",
      "nvidia/nemotron-3-nano:free",
      "poolside/laguna-s-2.1:free",
      "poolside/laguna-xs-2.1:free",
      "inclusionai/dots3-note-preview:free",
      "inclusionai/inkling:free",
      "inclusionai/inkling-small:free",
      "apodex/apodex-1.1-mini:free",
      "nvidia/nemotron-3-nano-omni:free",
    ],
    keyPlaceholder: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/settings/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
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
