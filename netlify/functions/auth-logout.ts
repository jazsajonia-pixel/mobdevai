import type { Config } from "@netlify/functions";
import { githubConfig } from "../lib/env";
import { handle, json } from "../lib/http";
import { AI_COOKIE, SESSION_COOKIE, clearCookie, readSession } from "../lib/session";
import { revokeToken } from "../lib/github";
import { assertSameOrigin } from "../lib/security";

/** POST /api/auth/logout — revokes the GitHub token (best effort) and clears the session + AI cookies. */
export default handle(["POST"], async (req) => {
  assertSameOrigin(req);
  const session = await readSession(req);
  const cfg = githubConfig();
  if (session && cfg) {
    await revokeToken({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, apiUrl: cfg.apiUrl, token: session.token });
  }
  // Session-only AI keys go with the session.
  return json({ ok: true }, { cookies: [clearCookie(req, SESSION_COOKIE), clearCookie(req, AI_COOKIE)] });
});

export const config: Config = { path: "/api/auth/logout" };
