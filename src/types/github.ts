/**
 * Wire types for /api/github/* and /api/auth/* — shared by Netlify Functions and the client.
 * Never include access tokens in any of these shapes.
 */

export interface SessionUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
}

export type AuthSessionResponse =
  | { authenticated: false }
  | { authenticated: true; user: SessionUser; scopes: string[]; includePrivate: boolean; expiresAt: string };

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface RepoSummary {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  language: string | null;
  pushedAt: string | null;
  permissions: RepoPermissions;
}

export interface RepoListResponse {
  repos: RepoSummary[];
  page: number;
  hasNext: boolean;
}

export interface BranchSummary {
  name: string;
  sha: string;
  protected: boolean;
}

export interface BranchListResponse {
  branches: BranchSummary[];
  /** True when the repo has more branches than we fetched. */
  truncated: boolean;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface TreeResponse {
  ref: string;
  commitSha: string;
  entries: TreeEntry[];
  /** GitHub truncated the tree, or we capped it — the file list is incomplete. */
  truncated: boolean;
}

export interface FileResponse {
  path: string;
  ref: string;
  sha: string;
  size: number;
  content: string;
}
