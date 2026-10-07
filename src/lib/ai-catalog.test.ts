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
    expect(PROVIDER_KINDS).toEqual(["openai", "anthropic", "gemini", "openrouter", "openai-compatible"]);
    expect(PROVIDERS.openrouter).toMatchObject({ name: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", needsBaseUrl: false });
  });

  it("offers the requested free OpenRouter models", () => {
    expect(PROVIDERS.openrouter.defaultModel).toBe("nvidia/nemotron-3-ultra:free");
    expect(PROVIDERS.openrouter.suggestedModels).toEqual([
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
    ]);
  });
});
