import type { Config } from "@netlify/functions";
import { z } from "zod";
import { HttpError, handle, json } from "../lib/http.js";
import { safeEqual } from "../lib/crypto.js";
import { sealSession } from "../lib/session.js";
import { openHandoff, s256 } from "../lib/mobile-auth.js";
import { clientKey, rateLimit } from "../lib/security.js";
import { parse } from "../lib/validate.js";

const bodySchema = z
  .object({
    handoff: z.string().min(16).max(4096),
    verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/, "Invalid verifier"),
  })
  .strict();

/**
 * POST /api/auth/mobile/exchange { handoff, verifier } — native app only (see lib/mobile-auth.ts).
 * Returns the sealed session token the app sends as `Authorization: Bearer …`. Never returns the
 * GitHub token itself: the bearer value is AES-GCM sealed with SESSION_SECRET.
 */
export default handle(["POST"], async (req, ctx) => {
  await rateLimit(`auth-mobile:${clientKey(req, ctx)}`, 20, 60_000);
  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(422, "VALIDATION_FAILED", "Body must be JSON.");
  }
  const { handoff, verifier } = parse(bodySchema, body, "body");
  const data = await openHandoff(handoff);
  if (!data || !safeEqual(await s256(verifier), data.codeChallenge)) {
    throw new HttpError(401, "OAUTH_STATE_MISMATCH", "Sign-in link expired or didn't come from this device. Try again.");
  }
  const { value, exp } = await sealSession(data.session);
  return json({
    token: value,
    authenticated: true,
    user: data.session.user,
    scopes: data.session.scopes,
    includePrivate: data.session.includePrivate,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
});

export const config: Config = { path: "/api/auth/mobile/exchange" };
