/**
 * Native app sign-in (chronoapp2 — Expo / React Native).
 *
 * The app can't share the browser's cookie jar, so the web OAuth flow gets a mobile variant:
 *  1. App → POST /api/auth/github/start { includePrivate, mobile: { redirectUri, codeChallenge } }.
 *     No state cookie: the OAuth `state` itself is sealed ("m." + seal({ nonce, includePrivate,
 *     redirectUri, codeChallenge })), so it can't be forged or altered.
 *  2. GitHub → /api/auth/github/callback (same registered callback URL as the web).
 *     On a mobile state we exchange the code, then redirect to `redirectUri?handoff=<sealed>`
 *     (a 3-minute sealed blob holding the session + the PKCE challenge).
 *  3. App → POST /api/auth/mobile/exchange { handoff, verifier } — sha256(verifier) must match the
 *     challenge (PKCE, so an intercepted handoff is useless). Returns the sealed session token,
 *     which the app stores in the OS keychain and sends as `Authorization: Bearer …`.
 */
import { seal, unseal } from "./crypto.js";
import { sessionSecret } from "./env.js";
import { HttpError } from "./http.js";
import type { SessionData } from "./session.js";

export const MOBILE_STATE_PREFIX = "m.";
const STATE_TTL = 60 * 10;
const HANDOFF_TTL = 60 * 3;

/** Only app deep links: the production scheme, plus Expo Go / dev-client schemes for development. */
const REDIRECT_RE = /^(chronoapp2|exp\+chronoapp2|exp):\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{0,240}$/;
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isAllowedMobileRedirect(uri: string): boolean {
  return REDIRECT_RE.test(uri) && !/[\s"<>\\]/.test(uri);
}

export interface MobileState {
  nonce: string;
  includePrivate: boolean;
  redirectUri: string;
  codeChallenge: string;
}

export interface MobileHandoff {
  session: Omit<SessionData, "v" | "exp">;
  codeChallenge: string;
}

function secretOrThrow(): string {
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, "GITHUB_OAUTH_NOT_CONFIGURED", "SESSION_SECRET is not configured.");
  return secret;
}

export async function sealMobileState(state: MobileState): Promise<string> {
  return MOBILE_STATE_PREFIX + (await seal(state, secretOrThrow(), "oauth-mobile-state", STATE_TTL));
}

export async function openMobileState(state: string | null): Promise<MobileState | null> {
  if (!state?.startsWith(MOBILE_STATE_PREFIX)) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const data = await unseal<MobileState>(state.slice(MOBILE_STATE_PREFIX.length), secret, "oauth-mobile-state");
  return data && isAllowedMobileRedirect(data.redirectUri) && CHALLENGE_RE.test(data.codeChallenge) ? data : null;
}

export async function sealHandoff(handoff: MobileHandoff): Promise<string> {
  return seal(handoff, secretOrThrow(), "mobile-handoff", HANDOFF_TTL);
}

export async function openHandoff(token: string): Promise<MobileHandoff | null> {
  return unseal<MobileHandoff>(token, secretOrThrow(), "mobile-handoff");
}

/** RFC 7636 S256: base64url(sha256(verifier)). */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(new Uint8Array(digest)).toString("base64url");
}

/** Appends query params to an app deep link (custom schemes don't always parse with URL()). */
export function withParams(uri: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${uri}${uri.includes("?") ? "&" : "?"}${qs}`;
}
