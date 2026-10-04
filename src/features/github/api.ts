import { api } from "@/lib/api";
import type {
  BranchListResponse,
  BranchSummary,
  CommitListResponse,
  CommitRequest,
  CommitResponse,
  CreateBranchRequest,
  FileResponse,
  PullListResponse,
  PullRequestRequest,
  PullRequestResponse,
  RepoListResponse,
  RepoSummary,
  TreeResponse,
} from "@/types/github";

const repoBase = (owner: string, repo: string) => `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

export const githubApi = {
  repos: (page = 1) => api<RepoListResponse>(`/github/repos?page=${page}`),
  repo: (owner: string, repo: string) => api<{ repo: RepoSummary }>(repoBase(owner, repo)).then((r) => r.repo),
  branches: (owner: string, repo: string) => api<BranchListResponse>(`${repoBase(owner, repo)}/branches`),
  tree: (owner: string, repo: string, ref: string) =>
    api<TreeResponse>(`${repoBase(owner, repo)}/tree?ref=${encodeURIComponent(ref)}`, { timeoutMs: 25_000 }),
  file: (owner: string, repo: string, ref: string, path: string) =>
    api<FileResponse>(`${repoBase(owner, repo)}/file?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`),
  // Phase 6 — Git shipping. Writes go through our functions; the token never reaches the browser.
  commit: (owner: string, repo: string, body: CommitRequest) => api<CommitResponse>(`${repoBase(owner, repo)}/commit`, { method: "POST", body, timeoutMs: 60_000 }),
  commits: (owner: string, repo: string, ref: string) => api<CommitListResponse>(`${repoBase(owner, repo)}/commits?ref=${encodeURIComponent(ref)}`),
  createBranch: (owner: string, repo: string, body: CreateBranchRequest) =>
    api<{ branch: BranchSummary }>(`${repoBase(owner, repo)}/branch`, { method: "POST", body }).then((r) => r.branch),
  pulls: (owner: string, repo: string, head: string) => api<PullListResponse>(`${repoBase(owner, repo)}/pulls?head=${encodeURIComponent(head)}`),
  createPull: (owner: string, repo: string, body: PullRequestRequest) => api<PullRequestResponse>(`${repoBase(owner, repo)}/pulls`, { method: "POST", body, timeoutMs: 30_000 }),
};
