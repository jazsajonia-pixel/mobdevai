import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http.js";
import { githubForRequest } from "../lib/gh-request.js";
import { mapRepo, type GhRepo } from "../lib/github.js";
import { repoParams } from "../lib/validate.js";

/** GET /api/github/repos/:owner/:repo — repository metadata and your permissions. */
export default handle(["GET"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const { gh } = await githubForRequest(req);
  const { data } = await gh.get<GhRepo>(`/repos/${owner}/${repo}`);
  return json({ repo: mapRepo(data) });
});

export const config: Config = { path: "/api/github/repos/:owner/:repo" };
