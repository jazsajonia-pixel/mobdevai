export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** Text-generation models supported by Chrono's server-managed agent selector. */
export const GEMINI_SERVER_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export type GeminiServerModel = (typeof GEMINI_SERVER_MODELS)[number];

export function isGeminiServerModel(value: string | null | undefined): value is GeminiServerModel {
  return !!value && (GEMINI_SERVER_MODELS as readonly string[]).includes(value);
}

export function effectiveGeminiModel(value: string | null | undefined): GeminiServerModel {
  return isGeminiServerModel(value) ? value : DEFAULT_GEMINI_MODEL;
}
