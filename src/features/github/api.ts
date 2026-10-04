import { api } from "@/lib/api";
import type { BranchListResponse, FileResponse, RepoListResponse, RepoSummary, TreeResponse } from "@/types/github";

const repoBase = (owner: string, repo: string) => `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

export const githubApi = {
  repos: (page = 1) => api<RepoListResponse>(`/github/repos?page=${page}`),
  repo: (owner: string, repo: string) => api<{ repo: RepoSummary }>(repoBase(owner, repo)).then((r) => r.repo),
  branches: (owner: string, repo: string) => api<BranchListResponse>(`${repoBase(owner, repo)}/branches`),
  tree: (owner: string, repo: string, ref: string) =>
    api<TreeResponse>(`${repoBase(owner, repo)}/tree?ref=${encodeURIComponent(ref)}`, { timeoutMs: 25_000 }),
  file: (owner: string, repo: string, ref: string, path: string) =>
    api<FileResponse>(`${repoBase(owner, repo)}/file?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`),
};
