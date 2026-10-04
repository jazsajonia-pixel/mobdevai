import { describe, expect, it } from "vitest";
import { capabilities, isSet, readiness } from "./env";

describe("isSet", () => {
  it("treats empty and .env.example placeholders as unset", () => {
    expect(isSet(undefined)).toBe(false);
    expect(isSet("  ")).toBe(false);
    expect(isSet("your-github-oauth-client-id")).toBe(false);
    expect(isSet("replace-with-a-long-random-string")).toBe(false);
    expect(isSet("Iv1.8a61f9b3a7aba766")).toBe(true);
  });
});

describe("capabilities", () => {
  it("requires both GitHub id and secret", () => {
    expect(capabilities({ GITHUB_CLIENT_ID: "abc" }).githubOAuth).toBe(false);
    expect(capabilities({ GITHUB_CLIENT_ID: "abc", GITHUB_CLIENT_SECRET: "def" }).githubOAuth).toBe(true);
  });

  it("requires a 32+ character session secret", () => {
    expect(capabilities({ SESSION_SECRET: "short" }).sessions).toBe(false);
    expect(capabilities({ SESSION_SECRET: "a".repeat(32) }).sessions).toBe(true);
  });
});

describe("readiness", () => {
  const good = {
    GITHUB_CLIENT_ID: "Iv1.abc",
    GITHUB_CLIENT_SECRET: "0123456789abcdef0123456789abcdef01234567",
    SESSION_SECRET: "s".repeat(40),
    ENCRYPTION_KEY: "e".repeat(44),
    DATABASE_URL: "postgres://u:p@db.example/app",
    APP_URL: "https://mdai.example",
  };

  it("passes a complete production config", () => {
    const r = readiness({ ...good, CONTEXT: "production" });
    expect(r.ready).toBe(true);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("blocks unsafe or incomplete production configs without echoing values", () => {
    const r = readiness({ ...good, CONTEXT: "production", SESSION_SECRET: "short", APP_URL: "http://mdai.example", AI_ALLOW_PRIVATE_BASE_URLS: "true", VITE_OPENAI_API_KEY: "sk-live" });
    expect(r.ready).toBe(false);
    const failing = r.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failing).toEqual(expect.arrayContaining(["session-secret", "app-url", "no-private-ai-urls", "no-client-secrets"]));
    expect(JSON.stringify(r)).not.toContain("sk-live");
    expect(JSON.stringify(r)).not.toContain("short");
  });

  it("is lenient locally (APP_URL optional, private AI URLs allowed)", () => {
    const r = readiness({ GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b", SESSION_SECRET: "s".repeat(32), AI_ALLOW_PRIVATE_BASE_URLS: "true" });
    expect(r.ready).toBe(true);
  });
});

describe("AI_ALLOW_PRIVATE_BASE_URLS in production", () => {
  it("is ignored when CONTEXT=production", async () => {
    const { normalizeBaseUrl } = await import("./ai/url-guard");
    const prev = { ...process.env };
    try {
      process.env.AI_ALLOW_PRIVATE_BASE_URLS = "true";
      process.env.CONTEXT = "dev";
      expect(normalizeBaseUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
      process.env.CONTEXT = "production";
      expect(() => normalizeBaseUrl("http://127.0.0.1:11434/v1")).toThrow();
    } finally {
      process.env = prev;
    }
  });
});
