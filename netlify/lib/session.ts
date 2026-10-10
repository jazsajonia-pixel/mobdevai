import { parseCookies, serializeCookie, isSecureRequest } from "./cookies.js";
import { seal, unseal } from "./crypto.js";
import { sessionSecret } from "./env.js";
import { HttpError } from "./http.js";
import type { SessionUser } from "../../src/types/github.js";

/**
 * Server session = AES-GCM sealed, HTTP-only cookie. It carries the GitHub access token,
 * which therefore never reaches browser JavaScript. Nothing is stored in plaintext anywhere.
 */

export const SESSION_COOKIE = "mdai_session";
export const STATE_COOKIE = "mdai_oauth_state";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
export const STATE_TTL = 60 * 10; // 10 minutes

export interface SessionData {
  v: 1;
  user: SessionUser;
  token: string;
  scopes: string[];
  includePrivate: boolean;
  exp: number;
}

export interface OAuthState {
  state: string;
  includePrivate: boolean;
}

/**
 * Native app (chronoapp2) sessions: the same sealed session value, sent as
 * `Authorization: Bearer <sealed>` instead of a cookie. Web requests never set this header.
 */
export function bearerSession(req: Request): string | undefined {
  const h = req.headers.get("authorization");
  const m = h ? /^Bearer\s+([A-Za-z0-9_-]{16,4096})\s*$/.exec(h) : null;
  return m?.[1];
}

export async function readSession(req: Request): Promise<SessionData | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const raw = bearerSession(req) ?? parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  const data = await unseal<SessionData>(raw, secret, "session");
  return data && data.v === 1 ? data : null;
}

/** Throws a 401 HttpError when there's no valid session. */
export async function requireSession(req: Request): Promise<SessionData> {
  const session = await readSession(req);
  if (!session) {
    const hadCookie = SESSION_COOKIE in parseCookies(req.headers.get("cookie")) || !!bearerSession(req);
    throw new HttpError(
      401,
      hadCookie ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
      hadCookie ? "Your session expired. Sign in with GitHub again." : "Sign in with GitHub first.",
      hadCookie ? [clearCookie(req, SESSION_COOKIE)] : [],
    );
  }
  return session;
}

/** The sealed session value (cookie value on the web, bearer token in the native app). */
export async function sealSession(data: Omit<SessionData, "v" | "exp">): Promise<{ value: string; exp: number }> {
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "SESSION_SECRET is not configured.");
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const value = await seal<SessionData>({ v: 1, exp, ...data }, secret, "session", SESSION_TTL);
  return { value, exp };
}

export async function sessionCookie(req: Request, data: Omit<SessionData, "v" | "exp">): Promise<string> {
  const { value } = await sealSession(data);
  return serializeCookie(SESSION_COOKIE, value, { maxAge: SESSION_TTL, secure: isSecureRequest(req), sameSite: "Lax" });
}

export async function stateCookie(req: Request, data: OAuthState): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "SESSION_SECRET is not configured.");
  const value = await seal(data, secret, "oauth-state", STATE_TTL);
  // Lax so the cookie is sent on GitHub's top-level redirect back to /callback.
  return serializeCookie(STATE_COOKIE, value, { maxAge: STATE_TTL, secure: isSecureRequest(req), sameSite: "Lax", path: "/api/auth" });
}

export async function readState(req: Request): Promise<OAuthState | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  return unseal<OAuthState>(parseCookies(req.headers.get("cookie"))[STATE_COOKIE], secret, "oauth-state");
}

/** Cookie paths: the OAuth state is scoped to /api/auth, AI provider config to /api/ai. */
export const AI_COOKIE = "mdai_ai";
/** Custom skills when there's no database (scoped to /api: read by /api/skills and /api/ai/agent). */
export const SKILLS_COOKIE = "mdai_skills";
const COOKIE_PATHS: Record<string, string> = { [STATE_COOKIE]: "/api/auth", [AI_COOKIE]: "/api/ai", [SKILLS_COOKIE]: "/api" };

export function clearCookie(req: Request, name: string): string {
  return serializeCookie(name, "", { maxAge: 0, secure: isSecureRequest(req), path: COOKIE_PATHS[name] ?? "/" });
}
