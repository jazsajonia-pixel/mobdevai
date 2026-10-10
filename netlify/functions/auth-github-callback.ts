import { log } from "../lib/log.js";
import type { Config } from "@netlify/functions";
import { appOrigin, githubConfig } from "../lib/env.js";
import { HttpError, handle, redirect } from "../lib/http.js";
import { safeEqual } from "../lib/crypto.js";
import { STATE_COOKIE, clearCookie, readState, sessionCookie } from "../lib/session.js";
import { exchangeCode, githubClient, mapUser, type GhUser } from "../lib/github.js";
import { recordLogin } from "../lib/db.js";
import { clientKey, rateLimit } from "../lib/security.js";
import type { ErrorCode } from "../../src/lib/error-codes.js";
import { openMobileState, sealHandoff, withParams, type MobileState } from "../lib/mobile-auth.js";

/**
 * GET /api/auth/github/callback?code=…&state=…
 * Verifies state, exchanges the code server-side, creates the encrypted session, then sends the
 * browser back into the app. Errors are reported to the sign-in screen as `?auth_error=CODE`.
 */
export default handle(["GET"], async (req, ctx) => {
  const origin = appOrigin(req);
  const clearState = clearCookie(req, STATE_COOKIE);
  // Native app sign-in carries a sealed state (see lib/mobile-auth.ts); errors go back to the app.
  const mobile: MobileState | null = await openMobileState(new URL(req.url).searchParams.get("state"));
  const fail = (code: ErrorCode) =>
    mobile ? redirect(withParams(mobile.redirectUri, { error: code })) : redirect(`${origin}/?auth_error=${code}#/signin`, [clearState]);

  try {
    await rateLimit(`auth-callback:${clientKey(req, ctx)}`, 20, 60_000);
    const cfg = githubConfig();
    if (!cfg) return fail("GITHUB_OAUTH_NOT_CONFIGURED");

    const url = new URL(req.url);
    if (url.searchParams.get("error") === "access_denied") return fail("OAUTH_DENIED");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = mobile ? { state: state ?? "", includePrivate: mobile.includePrivate } : await readState(req);
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

    if (mobile) {
      const handoff = await sealHandoff({ session: { user, token, scopes, includePrivate: saved.includePrivate }, codeChallenge: mobile.codeChallenge });
      return redirect(withParams(mobile.redirectUri, { handoff }));
    }

    const session = await sessionCookie(req, { user, token, scopes, includePrivate: saved.includePrivate });
    return redirect(`${origin}/#/app/projects`, [clearState, session]);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code);
    log("error", "auth callback failed", { error: err instanceof Error ? err.name : "unknown" });
    return fail("INTERNAL");
  }
});

export const config: Config = { path: "/api/auth/github/callback" };
