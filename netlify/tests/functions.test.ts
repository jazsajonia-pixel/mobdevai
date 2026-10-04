import { afterEach, describe, expect, it, vi } from "vitest";
import health from "../functions/health";
import authStart from "../functions/auth-github-start";
import authSession from "../functions/auth-session";

const SECRET = "ghs_super_secret_value_that_must_never_leak_123";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("reports capabilities as booleans and never leaks secret values", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "Iv1.abc123");
    vi.stubEnv("GITHUB_CLIENT_SECRET", SECRET);
    vi.stubEnv("OPENAI_API_KEY", SECRET);
    const res = await health(new Request("http://x/api/health"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("Iv1.abc123");
    const body = JSON.parse(text) as { capabilities: { githubOAuth: boolean; platformAiProviders: { openai: boolean } } };
    expect(body.capabilities.githubOAuth).toBe(true);
    expect(body.capabilities.platformAiProviders.openai).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects non-GET", async () => {
    const res = await health(new Request("http://x/api/health", { method: "POST" }));
    expect(res.status).toBe(405);
  });
});

describe("POST /api/auth/github/start", () => {
  it("explains missing configuration", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    const res = await authStart(new Request("http://x/api/auth/github/start", { method: "POST" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("GITHUB_OAUTH_NOT_CONFIGURED");
  });

  it("reports NOT_IMPLEMENTED when configured (Phase 0 boundary)", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "Iv1.abc123");
    vi.stubEnv("GITHUB_CLIENT_SECRET", SECRET);
    vi.stubEnv("SESSION_SECRET", "k9".repeat(20));
    const res = await authStart(new Request("http://x/api/auth/github/start", { method: "POST" }));
    expect(res.status).toBe(501);
    expect(await res.text()).not.toContain(SECRET);
  });
});

describe("GET /api/auth/session", () => {
  it("is unauthenticated in Phase 0", async () => {
    const res = await authSession(new Request("http://x/api/auth/session"));
    expect(await res.json()).toEqual({ authenticated: false });
  });
});
