import { githubConfig } from "./env.js";
import { HttpError } from "./http.js";
import { requireSession, clearCookie, SESSION_COOKIE, type SessionData } from "./session.js";
import { githubClient, type GitHubClient } from "./github.js";

/** Session + authenticated GitHub client for /api/github/* handlers. */
export async function githubForRequest(req: Request): Promise<{ gh: GitHubClient; session: SessionData }> {
  const cfg = githubConfig();
  if (!cfg) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "GitHub isn't configured on the server.");
  const session = await requireSession(req);
  const client = githubClient(session.token, cfg.apiUrl);
  // A revoked/expired GitHub token clears our cookie too, so the UI returns to sign-in cleanly.
  const expired = (err: unknown): never => {
    if (err instanceof HttpError && err.code === "SESSION_EXPIRED") {
      throw new HttpError(401, "SESSION_EXPIRED", err.message, [clearCookie(req, SESSION_COOKIE)]);
    }
    throw err;
  };
  const gh: GitHubClient = {
    get: <T,>(path: string, query?: Record<string, string | number | undefined>) => client.get<T>(path, query).catch(expired),
    send: <T,>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => client.send<T>(method, path, body).catch(expired),
  };
  return { gh, session };
}
