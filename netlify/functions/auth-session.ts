import type { Config } from "@netlify/functions";
import { json, methodNotAllowed } from "../lib/http";

/**
 * GET /api/auth/session — who is signed in.
 * TODO(phase-1): read and verify the encrypted session cookie; return the GitHub profile
 * (login, name, avatar) — never the access token.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  return json({ authenticated: false });
};

export const config: Config = { path: "/api/auth/session" };
