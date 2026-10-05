import type { Config } from "@netlify/functions";
import { z } from "zod";
import { handle, json } from "../lib/http.js";
import { githubForRequest } from "../lib/gh-request.js";
import { hasNextPage, mapRepo, type GhRepo } from "../lib/github.js";
import { parse } from "../lib/validate.js";
import type { RepoListResponse } from "../../src/types/github.js";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(50).default(1) });

/** GET /api/github/repos?page=N — repositories the user can access, most recently pushed first. */
export default handle(["GET"], async (req) => {
  const { gh } = await githubForRequest(req);
  const { page } = parse(querySchema, Object.fromEntries(new URL(req.url).searchParams), "query");
  const { data, headers } = await gh.get<GhRepo[]>("/user/repos", {
    sort: "pushed",
    per_page: 50,
    page,
    affiliation: "owner,collaborator,organization_member",
  });
  const body: RepoListResponse = { repos: data.map(mapRepo), page, hasNext: hasNextPage(headers) };
  return json(body);
});

export const config: Config = { path: "/api/github/repos" };
