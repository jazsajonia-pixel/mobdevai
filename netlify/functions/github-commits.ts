import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { mapCommit, type GhCommitListItem } from "../lib/git";
import { parse, refSchema, repoParams } from "../lib/validate";
import type { CommitListResponse } from "../../src/types/github";

/** GET /api/github/repos/:owner/:repo/commits?ref=BRANCH — the 10 most recent commits. */
export default handle(["GET"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const ref = parse(refSchema, new URL(req.url).searchParams.get("ref"), "ref");
  const { gh } = await githubForRequest(req);
  const { data } = await gh.get<GhCommitListItem[]>(`/repos/${owner}/${repo}/commits`, { sha: ref, per_page: 10 });
  const body: CommitListResponse = { commits: data.map(mapCommit) };
  return json(body);
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/commits" };
