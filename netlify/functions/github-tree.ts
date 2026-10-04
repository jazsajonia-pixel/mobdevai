import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { mapTree, type GhBranch, type GhTree } from "../lib/github";
import { parse, refSchema, repoParams } from "../lib/validate";
import type { TreeResponse } from "../../src/types/github";

/** GET /api/github/repos/:owner/:repo/tree?ref=BRANCH — full recursive file tree for a branch. */
export default handle(["GET"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const ref = parse(refSchema, new URL(req.url).searchParams.get("ref"), "ref");
  const { gh } = await githubForRequest(req);

  // Resolve the branch first so names with slashes (feature/x) work and we pin an exact commit.
  const { data: branch } = await gh.get<GhBranch & { commit: { sha: string; commit: { tree: { sha: string } } } }>(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(ref)}`,
  );
  const { data: tree } = await gh.get<GhTree>(`/repos/${owner}/${repo}/git/trees/${branch.commit.commit.tree.sha}`, { recursive: 1 });
  const body: TreeResponse = { ref, commitSha: branch.commit.sha, ...mapTree(tree) };
  return json(body);
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/tree" };
