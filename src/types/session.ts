/** How the current user is using the app. */
export type SessionMode = "anonymous" | "demo" | "github";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export type Session =
  | { mode: "anonymous" }
  | { mode: "demo"; startedAt: string }
  | { mode: "github"; user: GitHubUser };
