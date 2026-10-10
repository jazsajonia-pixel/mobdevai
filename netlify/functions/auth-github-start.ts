import type { Config } from "@netlify/functions";
import { z } from "zod";
import { appOrigin, githubConfig } from "../lib/env.js";
import { HttpError, handle, json } from "../lib/http.js";
import { randomToken } from "../lib/crypto.js";
import { stateCookie } from "../lib/session.js";
import { scopesFor } from "../lib/github.js";
import { assertSameOrigin, clientKey, rateLimit } from "../lib/security.js";
import { parse } from "../lib/validate.js";
import { CHALLENGE_RE, isAllowedMobileRedirect, sealMobileState } from "../lib/mobile-auth.js";

const bodySchema = z
  .object({
    includePrivate: z.boolean().default(false),
    /** Native app sign-in (chronoapp2). Web clients never send this. */
    mobile: z
      .object({
        redirectUri: z.string().max(256).refine(isAllowedMobileRedirect, "Invalid app redirect"),
        codeChallenge: z.string().regex(CHALLENGE_RE, "Invalid code challenge"),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * POST /api/auth/github/start  { includePrivate?: boolean }
 * Creates a one-time `state` (sealed in an HTTP-only cookie) and returns GitHub's authorize URL.
 */
export default handle(["POST"], async (req, ctx) => {
  assertSameOrigin(req);
  await rateLimit(`auth-start:${clientKey(req, ctx)}`, 10, 60_000);

  const cfg = githubConfig();
  if (!cfg) {
    throw new HttpError(
      503,
      "GITHUB_OAUTH_NOT_CONFIGURED",
      "GitHub sign-in needs GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SESSION_SECRET (32+ chars) in the Netlify environment.",
    );
  }

  const raw = await req.text();
  const body = parse(bodySchema, raw ? safeJson(raw) : {}, "body");

  const nonce = randomToken(24);
  const state = body.mobile
    ? await sealMobileState({ nonce, includePrivate: body.includePrivate, redirectUri: body.mobile.redirectUri, codeChallenge: body.mobile.codeChallenge })
    : nonce;
  const authorize = new URL(`${cfg.webUrl}/login/oauth/authorize`);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", `${appOrigin(req)}/api/auth/github/callback`);
  authorize.searchParams.set("scope", scopesFor(body.includePrivate));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  // Mobile: the sealed state travels in the URL; no cookie (the app's browser has its own jar).
  if (body.mobile) return json({ authorizeUrl: authorize.toString() });

  return json(
    { authorizeUrl: authorize.toString() },
    { cookies: [await stateCookie(req, { state, includePrivate: body.includePrivate })] },
  );
});

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(422, "VALIDATION_FAILED", "Body must be JSON.");
  }
}

export const config: Config = { path: "/api/auth/github/start" };
