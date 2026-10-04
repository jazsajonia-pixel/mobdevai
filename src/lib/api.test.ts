import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { AppError } from "./errors";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("api()", () => {
  it("returns parsed JSON on success", async () => {
    mockFetch(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
    await expect(api<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
  });

  it("maps server error codes", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ error: { code: "GITHUB_OAUTH_NOT_CONFIGURED", message: "x" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(api("/auth/github/start", { method: "POST" })).rejects.toMatchObject({ code: "GITHUB_OAUTH_NOT_CONFIGURED" });
  });

  it("treats an HTML fallback as backend unavailable", async () => {
    mockFetch(async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
    await expect(api("/health")).rejects.toMatchObject({ code: "BACKEND_UNAVAILABLE" });
  });

  it("maps network failures", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await api("/health").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("BACKEND_UNAVAILABLE");
  });

  it("falls back to status-based codes", async () => {
    mockFetch(async () => new Response("{}", { status: 429, headers: { "content-type": "application/json" } }));
    await expect(api("/x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
