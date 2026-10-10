import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import authStart from "../functions/auth-github-start";
import authCallback from "../functions/auth-github-callback";
import authSession from "../functions/auth-session";
import authMobileExchange from "../functions/auth-mobile-exchange";
import { s256 } from "../lib/mobile-auth";
import { ORIGIN, SECRET_TOKEN, configureEnv, gh, mockGitHub } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const VERIFIER = "v".repeat(20) + "0123456789abcdefghijklmnop";
const REDIRECT = "chronoapp2://auth";

describe("native app (chronoapp2) sign-in", () => {
  beforeEach(() => configureEnv());

  function mockOAuth() {
    return mockGitHub({
      "POST /login/oauth/access_token": () => gh({ access_token: SECRET_TOKEN, scope: "read:user,public_repo" }),
      "GET /user": () => gh({ id: 7, login: "octo", name: "Octo Cat", avatar_url: "https://avatars.example/7" }),
    });
  }

  async function begin(redirectUri = REDIRECT) {
    const res = await authStart(
      new Request(`${ORIGIN}/api/auth/github/start`, {
        method: "POST",
        body: JSON.stringify({ includePrivate: false, mobile: { redirectUri, codeChallenge: await s256(VERIFIER) } }),
      }),
    );
    return res;
  }

  it("issues a sealed state without a cookie, hands off via deep link and exchanges with PKCE", async () => {
    mockOAuth();
    const start = await begin();
    expect(start.status).toBe(200);
    expect(start.headers.getSetCookie()).toHaveLength(0);
    const { authorizeUrl } = (await start.json()) as { authorizeUrl: string };
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    expect(state.startsWith("m.")).toBe(true);

    const cb = await authCallback(new Request(`${ORIGIN}/api/auth/github/callback?code=abc&state=${encodeURIComponent(state)}`));
    expect(cb.status).toBe(302);
    const location = cb.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?handoff=`)).toBe(true);
    expect(location).not.toContain(SECRET_TOKEN);
    const handoff = new URLSearchParams(location.split("?")[1]).get("handoff")!;

    const wrong = await authMobileExchange(new Request(`${ORIGIN}/api/auth/mobile/exchange`, { method: "POST", body: JSON.stringify({ handoff, verifier: "x".repeat(43) }) }));
    expect(wrong.status).toBe(401);

    const ok = await authMobileExchange(new Request(`${ORIGIN}/api/auth/mobile/exchange`, { method: "POST", body: JSON.stringify({ handoff, verifier: VERIFIER }) }));
    expect(ok.status).toBe(200);
    const text = await ok.text();
    expect(text).not.toContain(SECRET_TOKEN);
    const body = JSON.parse(text) as { token: string; user: { login: string } };
    expect(body.user.login).toBe("octo");

    const s = await authSession(new Request(`${ORIGIN}/api/auth/session`, { headers: { authorization: `Bearer ${body.token}` } }));
    expect(await s.json()).toMatchObject({ authenticated: true, user: { login: "octo" } });
  });

  it("rejects non-app redirect URIs", async () => {
    expect((await begin("https://evil.example/cb")).status).toBe(422);
    expect((await begin("javascript://alert(1)")).status).toBe(422);
  });

  it("reports callback errors back to the app", async () => {
    const start = await begin();
    const { authorizeUrl } = (await start.json()) as { authorizeUrl: string };
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    const cb = await authCallback(new Request(`${ORIGIN}/api/auth/github/callback?error=access_denied&state=${encodeURIComponent(state)}`));
    expect(cb.headers.get("location")).toBe(`${REDIRECT}?error=OAUTH_DENIED`);
  });

  it("ignores a garbage bearer token", async () => {
    const s = await authSession(new Request(`${ORIGIN}/api/auth/session`, { headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaa" } }));
    expect(await s.json()).toMatchObject({ authenticated: false });
  });
});
