import { githubConfig } from "./env";
import { HttpError } from "./http";
import { requireSession, clearCookie, SESSION_COOKIE, type SessionData } from "./session";
import { githubClient, type GitHubClient } from "./github";

/** Session + authenticated GitHub client for /api/github/* handlers. */
export async function githubForRequest(req: Request): Promise<{ gh: GitHubClient; session: SessionData }> {
  const cfg = githubConfig();
  if (!cfg) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "GitHub isn't configured on the server.");
  const session = await requireSession(req);
  const client = githubClient(session.token, cfg.apiUrl);
  // A revoked/expired GitHub token clears our cookie too, so the UI returns to sign-in cleanly.
  const gh: GitHubClient = {
    async get(path, query) {
      try {
        return await client.get(path, query);
      } catch (err) {
        if (err instanceof HttpError && err.code === "SESSION_EXPIRED") {
          throw new HttpError(401, "SESSION_EXPIRED", err.message, [clearCookie(req, SESSION_COOKIE)]);
        }
        throw err;
      }
    },
  };
  return { gh, session };
}
