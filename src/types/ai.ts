/** Wire types for AI provider configuration. API keys never appear in any of these. */

export type ProviderKind = "openai" | "anthropic" | "gemini" | "groq" | "openai-compatible";

/** Where saved keys live. `session`: encrypted HTTP-only cookie, `database`: encrypted at rest. */
export type ProviderStorage = "database" | "session" | "unavailable";

export interface ProviderTestResult {
  ok: boolean;
  at: string;
  latencyMs?: number;
  /** Error code when !ok. */
  code?: string;
  message?: string;
}

export interface PublicProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  /** Masked, e.g. "sk-…a1B2". Never the key. */
  keyHint: string;
  /** `platform` = configured by the server operator via env vars (read-only). */
  source: "user" | "platform";
  lastTest: ProviderTestResult | null;
  updatedAt: string;
}

export interface ProvidersResponse {
  storage: ProviderStorage;
  /** Why storage is what it is — shown to the user verbatim. */
  storageNote: string;
  maxProviders: number;
  providers: PublicProvider[];
  defaultId: string | null;
}

export interface ProviderInput {
  kind: ProviderKind;
  label?: string;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  enabled?: boolean;
  makeDefault?: boolean;
}

export interface ProviderPatch {
  label?: string;
  model?: string;
  baseUrl?: string | null;
  /** Replace the stored key. Omit to keep it. */
  apiKey?: string;
  enabled?: boolean;
  makeDefault?: boolean;
}

export interface TestProviderResponse {
  ok: true;
  latencyMs: number;
  model: string;
  /** Model IDs the key can list (when the provider supports listing). */
  models: string[];
  /** The model wasn't in the provider's list (may still work, e.g. aliases). */
  modelListed: boolean | null;
}
