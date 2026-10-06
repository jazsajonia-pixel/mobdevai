import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_KINDS } from "./ai-catalog";

describe("Chrono model catalog", () => {
  it("uses real OpenAI model IDs", () => {
    expect(PROVIDERS.openai.defaultModel).toBe("gpt-4o-mini");
    expect(PROVIDERS.openai.suggestedModels).toContain("gpt-4.1");
  });

  it("uses restored real-looking Gemini model names", () => {
    expect(PROVIDERS.anthropic.defaultModel).toBe("claude-3-5-sonnet-latest");
    expect(PROVIDERS.gemini.defaultModel).toBe("gemini-flash-latest");
    expect(PROVIDERS.gemini.suggestedModels).toContain("gemini-flash-latest");
  });

  it("preserves the provider kinds used by the server adapters", () => {
    expect(PROVIDER_KINDS).toEqual(["openai", "anthropic", "gemini", "groq", "openai-compatible"]);
  });
});
