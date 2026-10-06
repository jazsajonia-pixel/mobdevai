import type { Config } from "@netlify/functions";
import { githubConfig } from "../lib/env.js";
import { handle, json } from "../lib/http.js";
import { AI_COOKIE, SESSION_COOKIE, SKILLS_COOKIE, clearCookie, readSession } from "../lib/session.js";
import { revokeToken } from "../lib/github.js";
import { assertSameOrigin } from "../lib/security.js";

/** POST /api/auth/logout — revokes the GitHub token (best effort) and clears the session + AI cookies. */
export default handle(["POST"], async (req) => {
  assertSameOrigin(req);
  const session = await readSession(req);
  const cfg = githubConfig();
  if (session && cfg) {
    await revokeToken({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, apiUrl: cfg.apiUrl, token: session.token });
  }
  // Session-only AI keys go with the session.
  return json({ ok: true }, { cookies: [clearCookie(req, SESSION_COOKIE), clearCookie(req, AI_COOKIE), clearCookie(req, SKILLS_COOKIE)] });
});

export const config: Config = { path: "/api/auth/logout" };
