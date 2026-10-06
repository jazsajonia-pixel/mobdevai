import { api } from "@/lib/api";
import type { ProviderInput, ProviderKind, ProviderPatch, ProvidersResponse, TestProviderResponse } from "@/types/ai";

/**
 * AI provider settings client. Keys are sent once over HTTPS to our own server functions
 * (never directly to a provider from the browser) and are never returned.
 */
export const listProviders = () => api<ProvidersResponse>("/ai/providers");

export const createProvider = (input: ProviderInput) => api<ProvidersResponse>("/ai/providers", { method: "POST", body: input });

export const updateProvider = (id: string, patch: ProviderPatch) =>
  api<ProvidersResponse>(`/ai/providers/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });

export const deleteProvider = (id: string) => api<ProvidersResponse>(`/ai/providers/${encodeURIComponent(id)}`, { method: "DELETE" });

export const updateGeminiModel = async (model: string) => {
  await api<{ model: string }>("/ai/platform/gemini", { method: "PATCH", body: { model } });
  return listProviders();
};

export type TestInput =
  | { id: string; model?: string; baseUrl?: string | null }
  | { kind: ProviderKind; model: string; baseUrl?: string | null; apiKey: string };

// Tests make two upstream calls; allow for slow providers.
export const testProvider = (input: TestInput) => api<TestProviderResponse>("/ai/test-provider", { method: "POST", body: input, timeoutMs: 45_000 });
