import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_KINDS } from "./ai-catalog";

describe("Chrono model catalog", () => {
  it("uses the Chrono 1.0–1.3 default family for OpenAI", () => {
    expect(PROVIDERS.openai.defaultModel).toBe("Chrono 1.3");
    expect(PROVIDERS.openai.suggestedModels).toEqual(["Chrono 1.0", "Chrono 1.1", "Chrono 1.2", "Chrono 1.3"]);
  });

  it("uses restored real-looking Gemini model names", () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe("Claude 3.N");
    expect(PROVIDERS.gemini.defaultModel).toBe("gemini-2.5-flash");
    expect(PROVIDERS.gemini.suggestedModels).toContain("gemini-2.5-pro");
  });

  it("preserves the provider kinds used by the server adapters", () => {
    expect(PROVIDER_KINDS).toEqual(["openai", "anthropic", "gemini", "groq", "openai-compatible"]);
  });
});
