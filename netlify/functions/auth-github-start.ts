import type { Config } from "@netlify/functions";
import { capabilities } from "../lib/env";
import { errorResponse, methodNotAllowed } from "../lib/http";

/**
 * POST /api/auth/github/start
 *
 * TODO(phase-1):
 *  1. Generate a random `state`, store it in a signed HTTP-only, SameSite=Lax cookie.
 *  2. Return { authorizeUrl: "https://github.com/login/oauth/authorize?client_id=…&scope=…&state=…" }
 *     with minimal scopes (read:user, plus `repo` only when the user opts into private repos;
 *     or migrate to a GitHub App with fine-grained repository permissions).
 *  3. Add netlify/functions/auth-github-callback.ts to verify state, exchange the code
 *     server-side, and create an encrypted session. Tokens never reach the browser.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  const caps = capabilities();
  if (!caps.githubOAuth || !caps.sessions) {
    return errorResponse(
      503,
      "GITHUB_OAUTH_NOT_CONFIGURED",
      "GitHub sign-in needs GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SESSION_SECRET (32+ chars) in the Netlify environment.",
    );
  }

  return errorResponse(501, "NOT_IMPLEMENTED", "GitHub OAuth is configured, but the sign-in flow ships in Phase 1.");
};

export const config: Config = { path: "/api/auth/github/start" };
