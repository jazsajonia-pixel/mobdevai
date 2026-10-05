import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http.js";
import { githubForRequest } from "../lib/gh-request.js";
import { hasNextPage, mapBranch, type GhBranch } from "../lib/github.js";
import { repoParams } from "../lib/validate.js";
import type { BranchListResponse, BranchSummary } from "../../src/types/github.js";

const MAX_PAGES = 3; // up to 300 branches — enough for a phone picker

/** GET /api/github/repos/:owner/:repo/branches */
export default handle(["GET"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const { gh } = await githubForRequest(req);
  const branches: BranchSummary[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, headers } = await gh.get<GhBranch[]>(`/repos/${owner}/${repo}/branches`, { per_page: 100, page });
    branches.push(...data.map(mapBranch));
    if (!hasNextPage(headers)) break;
    if (page === MAX_PAGES) truncated = true;
  }
  const body: BranchListResponse = { branches, truncated };
  return json(body);
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/branches" };
