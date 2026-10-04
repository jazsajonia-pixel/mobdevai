import type { Config } from "@netlify/functions";
import { appOrigin, githubConfig } from "../lib/env";
import { HttpError, handle, redirect } from "../lib/http";
import { safeEqual } from "../lib/crypto";
import { STATE_COOKIE, clearCookie, readState, sessionCookie } from "../lib/session";
import { exchangeCode, githubClient, mapUser, type GhUser } from "../lib/github";
import { recordLogin } from "../lib/db";
import { clientKey, rateLimit } from "../lib/security";
import type { ErrorCode } from "../../src/lib/error-codes";

/**
 * GET /api/auth/github/callback?code=…&state=…
 * Verifies state, exchanges the code server-side, creates the encrypted session, then sends the
 * browser back into the app. Errors are reported to the sign-in screen as `?auth_error=CODE`.
 */
export default handle(["GET"], async (req, ctx) => {
  const origin = appOrigin(req);
  const clearState = clearCookie(req, STATE_COOKIE);
  const fail = (code: ErrorCode) => redirect(`${origin}/?auth_error=${code}#/signin`, [clearState]);

  try {
    rateLimit(`auth-callback:${clientKey(req, ctx)}`, 20, 60_000);
    const cfg = githubConfig();
    if (!cfg) return fail("GITHUB_OAUTH_NOT_CONFIGURED");

    const url = new URL(req.url);
    if (url.searchParams.get("error") === "access_denied") return fail("OAUTH_DENIED");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = await readState(req);
    if (!code || !state || !saved || !safeEqual(saved.state, state)) return fail("OAUTH_STATE_MISMATCH");

    const { token, scopes } = await exchangeCode({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      webUrl: cfg.webUrl,
      code,
      redirectUri: `${origin}/api/auth/github/callback`,
    });

    const { data } = await githubClient(token, cfg.apiUrl).get<GhUser>("/user");
    const user = mapUser(data);
    await recordLogin(user, scopes, saved.includePrivate);

    const session = await sessionCookie(req, { user, token, scopes, includePrivate: saved.includePrivate });
    return redirect(`${origin}/#/app/projects`, [clearState, session]);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code);
    console.error("[auth] callback failed", err instanceof Error ? err.name : "unknown");
    return fail("INTERNAL");
  }
});

export const config: Config = { path: "/api/auth/github/callback" };
