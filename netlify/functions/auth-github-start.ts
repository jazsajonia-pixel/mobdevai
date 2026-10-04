import type { Config } from "@netlify/functions";
import { z } from "zod";
import { appOrigin, githubConfig } from "../lib/env";
import { HttpError, handle, json } from "../lib/http";
import { randomToken } from "../lib/crypto";
import { stateCookie } from "../lib/session";
import { scopesFor } from "../lib/github";
import { assertSameOrigin, clientKey, rateLimit } from "../lib/security";
import { parse } from "../lib/validate";

const bodySchema = z.object({ includePrivate: z.boolean().default(false) }).strict();

/**
 * POST /api/auth/github/start  { includePrivate?: boolean }
 * Creates a one-time `state` (sealed in an HTTP-only cookie) and returns GitHub's authorize URL.
 */
export default handle(["POST"], async (req, ctx) => {
  assertSameOrigin(req);
  rateLimit(`auth-start:${clientKey(req, ctx)}`, 10, 60_000);

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

  const state = randomToken(24);
  const authorize = new URL(`${cfg.webUrl}/login/oauth/authorize`);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", `${appOrigin(req)}/api/auth/github/callback`);
  authorize.searchParams.set("scope", scopesFor(body.includePrivate));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

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
