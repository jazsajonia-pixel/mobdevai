import { z } from "zod";
import { HttpError } from "./http";
import { encodeRef, type GitHubClient } from "./github";
import { pathSchema, refSchema } from "./validate";
import type { CommitRequest, CommitResponse, CommitSummary, PullRequestSummary } from "../../src/types/github";

/**
 * Git Data API workflow for committing a set of full-file changes in ONE commit:
 *   (create branch) → conflict check vs. the workspace base → tree → commit → fast-forward ref.
 * Never force-pushes. A branch created here is deleted again if the commit can't be completed.
 */

export const shaSchema = z.string().regex(/^[0-9a-f]{40}$/i, "Invalid commit sha");
export const MAX_COMMIT_FILES = 300;
export const MAX_COMMIT_BODY = 5_000_000;

export const commitRequestSchema = z
  .object({
    branch: refSchema,
    createFrom: shaSchema.optional(),
    baseSha: shaSchema,
    message: z.string().trim().min(1, "Commit message is required").max(10_000),
    files: z
      .array(z.object({ path: pathSchema.refine((p) => !/(^|\/)\.git(\/|$)/.test(p), "Can't write inside .git"), content: z.string().max(1_000_000).nullable() }))
      .min(1, "Nothing to commit")
      .max(MAX_COMMIT_FILES, `At most ${MAX_COMMIT_FILES} files per commit`),
    allowDefaultBranch: z.boolean().optional(),
  })
  .refine((b) => new Set(b.files.map((f) => f.path)).size === b.files.length, "Duplicate file paths");

interface GhRepoLite {
  default_branch: string;
  archived: boolean;
  permissions?: { push?: boolean };
}
interface GhRef {
  object: { sha: string };
}
interface GhCommit {
  sha: string;
  html_url?: string;
  message?: string;
  tree: { sha: string };
}
interface GhTreeFull {
  sha: string;
  truncated: boolean;
  tree: { path: string; mode: string; type: string }[];
}
interface GhCompare {
  files?: { filename: string; previous_filename?: string }[];
}

export function isMessage(err: unknown, re: RegExp): boolean {
  return err instanceof HttpError && re.test(err.message);
}

export async function commitChanges(gh: GitHubClient, owner: string, repo: string, req: CommitRequest): Promise<CommitResponse> {
  const base = `/repos/${owner}/${repo}`;
  const { data: meta } = await gh.get<GhRepoLite>(base);
  if (meta.archived) throw new HttpError(403, "FORBIDDEN", "This repository is archived (read-only).");
  if (!meta.permissions?.push) throw new HttpError(403, "FORBIDDEN", "You don't have push access to this repository. Fork it on GitHub to ship changes.");
  if (req.branch === meta.default_branch && !req.createFrom && !req.allowDefaultBranch) {
    throw new HttpError(409, "BRANCH_PROTECTED", `Committing directly to ${meta.default_branch} needs explicit confirmation.`);
  }

  let head: string;
  let created = false;
  if (req.createFrom) {
    try {
      await gh.send("POST", `${base}/git/refs`, { ref: `refs/heads/${req.branch}`, sha: req.createFrom });
    } catch (err) {
      if (isMessage(err, /already exists/i)) throw new HttpError(409, "BRANCH_EXISTS", `A branch named ${req.branch} already exists.`);
      throw err;
    }
    head = req.createFrom;
    created = true;
  } else {
    const { data } = await gh.get<GhRef>(`${base}/git/ref/heads/${encodeRef(req.branch)}`);
    head = data.object.sha;
  }

  try {
    // Upstream moved since the workspace was loaded: refuse if any of OUR files changed there.
    if (head !== req.baseSha) {
      const { data: cmp } = await gh.get<GhCompare>(`${base}/compare/${req.baseSha}...${head}`);
      const upstream = new Set<string>();
      for (const f of cmp.files ?? []) {
        upstream.add(f.filename);
        if (f.previous_filename) upstream.add(f.previous_filename);
      }
      const clash = req.files.map((f) => f.path).filter((p) => upstream.has(p));
      if ((cmp.files?.length ?? 0) >= 300) throw new HttpError(409, "GIT_CONFLICT", `${req.branch} has too many new changes to check safely. Commit to a new branch instead.`);
      if (clash.length) {
        const list = clash.slice(0, 8).join(", ") + (clash.length > 8 ? ` and ${clash.length - 8} more` : "");
        throw new HttpError(409, "GIT_CONFLICT", `${req.branch} changed on GitHub in files you edited: ${list}.`);
      }
    }

    const { data: parent } = await gh.get<GhCommit>(`${base}/git/commits/${head}`);
    const { data: current } = await gh.get<GhTreeFull>(`${base}/git/trees/${parent.tree.sha}`, { recursive: 1 });
    const modes = new Map(current.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.mode]));

    const entries = req.files
      // Deleting a file that isn't there is a no-op (GitHub would reject it).
      .filter((f) => f.content !== null || current.truncated || modes.has(f.path))
      .map((f) => {
        const mode = modes.get(f.path);
        const keep = mode === "100755" ? "100755" : "100644"; // symlinks/submodules are rewritten as files only if edited
        return f.content === null ? { path: f.path, mode: keep, type: "blob", sha: null } : { path: f.path, mode: keep, type: "blob", content: f.content };
      });
    if (!entries.length) throw new HttpError(422, "NO_CHANGES", "These changes are already on the branch.");

    const { data: tree } = await gh.send<{ sha: string }>("POST", `${base}/git/trees`, { base_tree: parent.tree.sha, tree: entries });
    if (tree.sha === parent.tree.sha) throw new HttpError(422, "NO_CHANGES", "These changes are already on the branch.");
    const { data: commit } = await gh.send<GhCommit>("POST", `${base}/git/commits`, { message: req.message, tree: tree.sha, parents: [head] });

    try {
      await gh.send("PATCH", `${base}/git/refs/heads/${encodeRef(req.branch)}`, { sha: commit.sha, force: false });
    } catch (err) {
      if (isMessage(err, /fast.?forward/i)) throw new HttpError(409, "GIT_CONFLICT", `${req.branch} moved while committing. Try again, or commit to a new branch.`);
      throw err;
    }
    return {
      branch: req.branch,
      created,
      parentSha: head,
      commit: { sha: commit.sha, url: commit.html_url ?? `https://github.com/${owner}/${repo}/commit/${commit.sha}`, message: req.message },
      files: entries.length,
    };
  } catch (err) {
    // Reversible: don't leave an empty working branch behind.
    if (created) await gh.send("DELETE", `${base}/git/refs/heads/${encodeRef(req.branch)}`).catch(() => {});
    throw err;
  }
}

/* ── Mappers ──────────────────────────────────────────────────────── */

export interface GhPull {
  number: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at?: string | null;
  head: { ref: string };
  base: { ref: string };
}

export function mapPull(p: GhPull): PullRequestSummary {
  return { number: p.number, url: p.html_url, title: p.title, state: p.state, draft: !!p.draft, merged: !!p.merged_at, head: p.head.ref, base: p.base.ref };
}

export interface GhCommitListItem {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } | null };
  author?: { login?: string } | null;
}

export function mapCommit(c: GhCommitListItem): CommitSummary {
  return {
    sha: c.sha,
    message: c.commit.message.split("\n")[0]!.slice(0, 200),
    author: c.author?.login ?? c.commit.author?.name ?? "unknown",
    date: c.commit.author?.date ?? null,
    url: c.html_url,
  };
}
