import { describe, expect, it } from "vitest";
import { capabilities, isSet } from "./env";

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
