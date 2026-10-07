import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import providers from "../functions/ai-providers";
import provider from "../functions/ai-provider";
import testFn from "../functions/ai-test-provider";
import logout from "../functions/auth-logout";
import { sessionCookie } from "../lib/session";
import { decryptField, encryptField } from "../lib/crypto";
import { isPrivateAddress, normalizeBaseUrl } from "../lib/ai/url-guard";
import { redact } from "../lib/ai/adapters";
import { maskKey } from "../../src/lib/ai-catalog";
import type { ProvidersResponse } from "../../src/types/ai";
import { ORIGIN, SECRET_TOKEN, configureEnv, cookieHeader, gh, mockGitHub } from "./helpers";

const OPENAI_KEY = "sk-proj-USERKEY_never_leak_0123456789abcdefWXYZ";
const ANTHROPIC_KEY = "sk-ant-api03-USERKEY_never_leak_zzzz9876";
let session = "";

async function sessionFor(id: number) {
  const set = await sessionCookie(new Request(ORIGIN), {
    user: { id, login: `u${id}`, name: null, avatarUrl: "" },
    token: SECRET_TOKEN,
    scopes: ["public_repo"],
    includePrivate: false,
  });
  return cookieHeader(new Response(null, { headers: [["set-cookie", set]] }));
}

beforeAll(async () => {
  configureEnv();
  session = await sessionFor(1);
});

beforeEach(() => {
  configureEnv();
  vi.stubEnv("ENCRYPTION_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URLS", "");
});
afterEach(() => vi.unstubAllGlobals());

function req(path: string, cookie: string, method = "GET", body?: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Simple cookie jar so successive calls see the updated session-only cookie. */
function jar(initial: string) {
  let c = initial;
  return {
    get: () => c,
    take: (res: Response) => {
      c = cookieHeader(res, c);
      return res;
    },
  };
}

async function body<T>(res: Response): Promise<T> {
  const text = await res.text();
  expect(text).not.toContain(OPENAI_KEY);
  expect(text).not.toContain(ANTHROPIC_KEY);
  expect(text).not.toContain("USERKEY");
  return JSON.parse(text) as T;
}

const openAiOk = () =>
  mockGitHub({
    "GET /v1/models": () => gh({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }] }),
    "POST /v1/chat/completions": () => gh({ model: "gpt-4o-mini", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }),
  });

describe("AI providers — session-only storage", () => {
  it("requires sign-in", async () => {
    const res = await providers(new Request(`${ORIGIN}/api/ai/providers`));
    expect(res.status).toBe(401);
  });

  it("creates, lists masked, edits, defaults and removes providers without ever returning keys", async () => {
    const c = jar(session);
    let res = c.take(await providers(req("/api/ai/providers", c.get())));
    let data = await body<ProvidersResponse>(res);
    expect(data.storage).toBe("session");
    expect(data.storageNote).toMatch(/Session-only/);
    expect(data.providers).toEqual([]);

    res = c.take(await providers(req("/api/ai/providers", c.get(), "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY })));
    expect(res.status).toBe(201);
    const setCookie = res.headers.getSetCookie().join();
    expect(setCookie).toMatch(/mdai_ai=.*Path=\/api\/ai.*HttpOnly.*SameSite=Strict/);
    expect(setCookie).not.toContain("USERKEY");
    data = await body<ProvidersResponse>(res);
    expect(data.providers).toHaveLength(1);
    const first = data.providers[0]!;
    expect(first.keyHint).toBe("sk-…WXYZ");
    expect(first.isDefault).toBe(true); // first enabled provider becomes default

    res = c.take(await providers(req("/api/ai/providers", c.get(), "POST", { kind: "anthropic", model: "claude-sonnet-5-5", apiKey: ANTHROPIC_KEY, makeDefault: true })));
    data = await body<ProvidersResponse>(res);
    const second = data.providers.find((p) => p.kind === "anthropic")!;
    expect(data.defaultId).toBe(second.id);

    // Disable the default → default moves to the other enabled provider.
    res = c.take(await provider(req(`/api/ai/providers/${second.id}`, c.get(), "PATCH", { enabled: false }), { params: { id: second.id } } as never));
    data = await body<ProvidersResponse>(res);
    expect(data.defaultId).toBe(first.id);

    // Can't default a disabled provider.
    res = await provider(req(`/api/ai/providers/${second.id}`, c.get(), "PATCH", { makeDefault: true }), { params: { id: second.id } } as never);
    expect(res.status).toBe(409);

    // Replace key + rename.
    res = c.take(await provider(req(`/api/ai/providers/${first.id}`, c.get(), "PATCH", { label: "Work", apiKey: "sk-proj-USERKEY_replacement_key_9999" }), { params: { id: first.id } } as never));
    data = await body<ProvidersResponse>(res);
    expect(data.providers.find((p) => p.id === first.id)).toMatchObject({ label: "Work", keyHint: "sk-…9999" });

    res = c.take(await provider(req(`/api/ai/providers/${first.id}`, c.get(), "DELETE"), { params: { id: first.id } } as never));
    data = await body<ProvidersResponse>(res);
    expect(data.providers.map((p) => p.id)).toEqual([second.id]);
    expect(data.defaultId).toBeNull();
  });

  it("isolates session-only providers per GitHub user", async () => {
    const c = jar(session);
    c.take(await providers(req("/api/ai/providers", c.get(), "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY })));
    const aiCookie = c.get().split("; ").find((x) => x.startsWith("mdai_ai="))!;
    const other = `${await sessionFor(2)}; ${aiCookie}`;
    const data = await body<ProvidersResponse>(await providers(req("/api/ai/providers", other)));
    expect(data.providers).toEqual([]);
  });

  it("honors a user's OpenRouter default over a configured server Gemini provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "server-gemini-test-key");
    const c = jar(session);
    const res = c.take(await providers(req("/api/ai/providers", c.get(), "POST", {
      kind: "openrouter",
      model: "nvidia/nemotron-3.5-lightning:free",
      apiKey: "sk-or-v1-user-test-key",
      makeDefault: true,
    })));
    const data = await body<ProvidersResponse>(res);
    const userProvider = data.providers.find((p) => p.kind === "openrouter")!;
    const serverGemini = data.providers.find((p) => p.id === "platform:gemini")!;
    expect(data.defaultId).toBe(userProvider.id);
    expect(userProvider.isDefault).toBe(true);
    expect(serverGemini.isDefault).toBe(false);
  });

  it("rejects cross-site writes and invalid input", async () => {
    const bad = new Request(`${ORIGIN}/api/ai/providers`, { method: "POST", headers: { cookie: session, origin: "https://evil.example" }, body: "{}" });
    expect((await providers(bad)).status).toBe(403);
    const r1 = await providers(req("/api/ai/providers", session, "POST", { kind: "openai", model: "gpt", apiKey: "has space key" }));
    expect(r1.status).toBe(422);
    const r2 = await providers(req("/api/ai/providers", session, "POST", { kind: "openai-compatible", model: "m", apiKey: "abcdefghijk" }));
    expect(((await r2.json()) as { error: { code: string } }).error.code).toBe("AI_BAD_BASE_URL");
    const r3 = await providers(req("/api/ai/providers", session, "POST", { kind: "openai-compatible", model: "m", apiKey: "abcdefghijk", baseUrl: "https://169.254.169.254/v1" }));
    expect(((await r3.json()) as { error: { code: string } }).error.code).toBe("AI_BAD_BASE_URL");
  });

  it("logout clears the AI cookie", async () => {
    const res = await logout(req("/api/auth/logout", session, "POST"));
    expect(res.headers.getSetCookie().join()).toMatch(/mdai_ai=; Path=\/api\/ai; Max-Age=0/);
  });
});

describe("POST /api/ai/test-provider", () => {
  it("tests unsaved settings: sends the key only to the provider, returns models", async () => {
    const calls = openAiOk();
    const res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY }));
    expect(res.status).toBe(200);
    const data = await body<{ ok: boolean; models: string[]; modelListed: boolean }>(res);
    expect(data).toMatchObject({ ok: true, modelListed: true, models: ["gpt-4.1-mini", "gpt-4o-mini"] });
    expect(calls.every((c) => c.url.origin === "https://api.openai.com")).toBe(true);
    const chat = calls.find((c) => c.url.pathname.endsWith("/chat/completions"))!;
    expect(new Headers(chat.init?.headers).get("authorization")).toBe(`Bearer ${OPENAI_KEY}`);
    expect(chat.init?.redirect).toBe("manual");
    expect(JSON.parse(String(chat.init?.body))).toMatchObject({ max_completion_tokens: 16 });
  });

  it("tests OpenRouter using its OpenAI-compatible models and chat endpoints", async () => {
    const key = "sk-or-v1-test-key-secret-12345";
    const calls = mockGitHub({
      "GET /api/v1/models": () => gh({ data: [{ id: "anthropic/claude-3.7-sonnet" }] }),
      "POST /api/v1/chat/completions": () => gh({ model: "anthropic/claude-3.7-sonnet", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }),
    });
    const res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openrouter", model: "anthropic/claude-3.7-sonnet", apiKey: key }));
    expect(res.status).toBe(200);
    expect(calls.every((call) => call.url.origin === "https://openrouter.ai")).toBe(true);
    expect(calls.map((call) => call.url.pathname)).toEqual(["/api/v1/models", "/api/v1/chat/completions"]);
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe(`Bearer ${key}`);
    expect((await body<{ models: string[] }>(res)).models).toContain("anthropic/claude-3.7-sonnet");
  });

  it("tests a saved provider by id and records the result", async () => {
    const c = jar(session);
    let data = await body<ProvidersResponse>(c.take(await providers(req("/api/ai/providers", c.get(), "POST", { kind: "anthropic", model: "claude-sonnet-5-5", apiKey: ANTHROPIC_KEY }))));
    const id = data.providers[0]!.id;
    const calls = mockGitHub({
      "GET /v1/models": () => gh({ data: [{ id: "claude-sonnet-5-5" }] }),
      "POST /v1/messages": () => gh({ model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 1 } }),
    });
    const res = c.take(await testFn(req("/api/ai/test-provider", c.get(), "POST", { id })));
    expect(res.status).toBe(200);
    expect(new Headers(calls[1]!.init?.headers).get("x-api-key")).toBe(ANTHROPIC_KEY);
    data = await body<ProvidersResponse>(await providers(req("/api/ai/providers", c.get())));
    expect(data.providers[0]!.lastTest).toMatchObject({ ok: true });
  });

  it("maps a 401 to AI_INVALID_KEY and redacts echoed keys", async () => {
    mockGitHub({ "GET /v1/models": () => gh({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}` } }, { status: 401 }) });
    const res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY }));
    expect(res.status).toBe(400);
    const data = await body<{ error: { code: string } }>(res);
    expect(data.error.code).toBe("AI_INVALID_KEY");
  });

  it("maps model errors, rate limits and outages", async () => {
    mockGitHub({
      "GET /v1beta/models": () => gh({ models: [] }),
      "POST /v1beta/models/nope:generateContent": () => gh({ error: { message: "models/nope is not found" } }, { status: 404 }),
    });
    let res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "gemini", model: "nope", apiKey: "AIzaSyTEST_gemini_key_123" }));
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("AI_MODEL_NOT_FOUND");

    mockGitHub({ "GET /v1/models": () => gh({}, { status: 429 }) });
    res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY }));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("AI_QUOTA_EXCEEDED");

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openai", model: "gpt-4o-mini", apiKey: OPENAI_KEY }));
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("refuses redirects from compatible endpoints", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URLS", "true");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })));
    const res = await testFn(req("/api/ai/test-provider", session, "POST", { kind: "openai-compatible", model: "m", baseUrl: "http://127.0.0.1:9/v1", apiKey: "abcdefghijk" }));
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("AI_BAD_BASE_URL");
  });
});

describe("platform providers + database mode notes", () => {
  it("honors an explicit platform default when several server providers are available", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-SERVERKEY_openai_abcdef");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-SERVERKEY_anthropic");
    vi.stubEnv("GEMINI_API_KEY", "AIzaSySERVERKEY_gemini");
    vi.stubEnv("AI_DEFAULT_PROVIDER", "gemini");
    const data = (await (await providers(req("/api/ai/providers", session))).json()) as ProvidersResponse;
    expect(data.defaultId).toBe("platform:gemini");
    expect(data.providers.find((p) => p.id === "platform:gemini")?.isDefault).toBe(true);
  });

  it("lists server-provided keys as read-only without revealing them", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-SERVERKEY_platform_secret_abcdef");
    const res = await providers(req("/api/ai/providers", session));
    const text = await res.text();
    expect(text).not.toContain("SERVERKEY");
    const data = JSON.parse(text) as ProvidersResponse;
    expect(data.providers).toEqual([expect.objectContaining({ id: "platform:openai", source: "platform", keyHint: "Server key", isDefault: true })]);
    const del = await provider(req("/api/ai/providers/platform:openai", session, "DELETE"), { params: { id: "platform:openai" } } as never);
    expect(del.status).toBe(403);
  });

  it("suggests ENCRYPTION_KEY when a database exists without it", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.example/x");
    const data = (await (await providers(req("/api/ai/providers", session))).json()) as ProvidersResponse;
    expect(data.storage).toBe("session");
    expect(data.storageNote).toMatch(/ENCRYPTION_KEY/);
  });
});

describe("ai helpers", () => {
  it("field encryption is bound to its AAD", async () => {
    const secret = "e".repeat(44);
    const ct = await encryptField("sk-secret", secret, "user:1|provider:a");
    expect(ct).not.toContain("sk-secret");
    expect(await decryptField(ct, secret, "user:1|provider:a")).toBe("sk-secret");
    expect(await decryptField(ct, secret, "user:2|provider:a")).toBeNull();
    expect(await decryptField(ct, "f".repeat(44), "user:1|provider:a")).toBeNull();
  });

  it("validates base URLs against SSRF targets", () => {
    expect(normalizeBaseUrl("https://api.together.xyz/v1/")).toBe("https://api.together.xyz/v1");
    for (const u of ["http://api.example.com", "https://localhost/v1", "https://10.0.0.1", "https://[::1]/", "https://u:p@api.example.com", "https://metadata.internal", "https://api.example.com/v1?x=1", "nonsense"]) {
      expect(() => normalizeBaseUrl(u), u).toThrow();
    }
    expect(isPrivateAddress("192.168.1.2")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("masks and redacts keys", () => {
    expect(maskKey(OPENAI_KEY)).toBe("sk-…WXYZ");
    expect(maskKey("AIzaSyABCDEFG12345")).toBe("AIza…2345");
    expect(maskKey("short")).toBe("••••");
    expect(redact(`bad key ${OPENAI_KEY}`)).not.toContain("USERKEY");
  });
});
