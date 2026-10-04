import { vi } from "vitest";

export const SECRET_TOKEN = "gho_TEST_token_that_must_never_leak_0123456789";
export const CLIENT_SECRET = "client_secret_value_never_leak_abcdef";
export const ORIGIN = "https://mdai.example";

export function configureEnv() {
  vi.stubEnv("GITHUB_CLIENT_ID", "Iv1.testclient");
  vi.stubEnv("GITHUB_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("SESSION_SECRET", "k9".repeat(20));
  vi.stubEnv("APP_URL", ORIGIN);
  vi.stubEnv("GITHUB_API_URL", "");
  vi.stubEnv("GITHUB_WEB_URL", "");
  vi.stubEnv("DATABASE_URL", "");
}

/** Collect `name=value` pairs from Set-Cookie headers into a Cookie header string. */
export function cookieHeader(res: Response, existing = ""): string {
  const jar = new Map(existing.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]));
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const [name, ...v] = pair!.split("=");
    const value = v.join("=");
    if (/Max-Age=0/.test(c)) jar.delete(name!);
    else jar.set(name!, value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;

/** Stub global fetch with a router keyed by `METHOD pathname`. Records calls. */
export function mockGitHub(routes: Record<string, Route>) {
  const calls: { method: string; url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url, init });
      const route = routes[`${method} ${url.pathname}`];
      if (!route) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      return route(url, init);
    }),
  );
  return calls;
}

export function gh(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}
