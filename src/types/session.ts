import type { SessionUser } from "./github";

/** How the current user is using the app. */
export type SessionMode = "anonymous" | "github";

export type GitHubUser = SessionUser;

export type Session =
  | { mode: "anonymous" }
  | { mode: "github"; user: SessionUser; scopes: string[]; includePrivate: boolean; expiresAt: string };
