import { parseCookies, serializeCookie, isSecureRequest } from "./cookies";
import { seal, unseal } from "./crypto";
import { sessionSecret } from "./env";
import { HttpError } from "./http";
import type { SessionUser } from "../../src/types/github";

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

export async function readSession(req: Request): Promise<SessionData | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const raw = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  const data = await unseal<SessionData>(raw, secret, "session");
  return data && data.v === 1 ? data : null;
}

/** Throws a 401 HttpError when there's no valid session. */
export async function requireSession(req: Request): Promise<SessionData> {
  const session = await readSession(req);
  if (!session) {
    const hadCookie = SESSION_COOKIE in parseCookies(req.headers.get("cookie"));
    throw new HttpError(
      401,
      hadCookie ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
      hadCookie ? "Your session expired. Sign in with GitHub again." : "Sign in with GitHub first.",
      hadCookie ? [clearCookie(req, SESSION_COOKIE)] : [],
    );
  }
  return session;
}

export async function sessionCookie(req: Request, data: Omit<SessionData, "v" | "exp">): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "SESSION_SECRET is not configured.");
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const value = await seal<SessionData>({ v: 1, exp, ...data }, secret, "session", SESSION_TTL);
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

export function clearCookie(req: Request, name: string): string {
  return serializeCookie(name, "", { maxAge: 0, secure: isSecureRequest(req), path: name === STATE_COOKIE ? "/api/auth" : "/" });
}
