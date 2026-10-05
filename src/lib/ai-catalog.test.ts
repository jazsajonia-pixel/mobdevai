import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_KINDS } from "./ai-catalog";

describe("Chrono model catalog", () => {
  it("uses the Chrono 1.0–1.3 default family for OpenAI", () => {
    expect(PROVIDERS.openai.defaultModel).toBe("Chrono 1.3");
    expect(PROVIDERS.openai.suggestedModels).toEqual(["Chrono 1.0", "Chrono 1.1", "Chrono 1.2", "Chrono 1.3"]);
  });

  it("uses fictional 3.N families for Anthropic and Gemini", () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe("Claude 3.N");
    expect(PROVIDERS.gemini.defaultModel).toBe("Gemini 3.N");
    expect(PROVIDERS.gemini.suggestedModels).toContain("Gemini 3.N Pro");
  });

  it("preserves the provider kinds used by the server adapters", () => {
    expect(PROVIDER_KINDS).toEqual(["openai", "anthropic", "gemini", "openai-compatible"]);
  });
});
