import type { Config } from "@netlify/functions";
import { z } from "zod";
import { HttpError, handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { isMessage, mapPull, type GhPull } from "../lib/git";
import { assertSameOrigin, rateLimit } from "../lib/security";
import { parse, readJson, refSchema, repoParams } from "../lib/validate";
import type { PullListResponse, PullRequestResponse } from "../../src/types/github";

const createSchema = z
  .object({
    head: refSchema,
    base: refSchema,
    title: z.string().trim().min(1, "Title is required").max(256),
    body: z.string().max(60_000),
    draft: z.boolean().optional(),
  })
  .refine((b) => b.head !== b.base, "Head and base must differ");

/**
 * GET  /api/github/repos/:owner/:repo/pulls?head=BRANCH — open PRs from a branch.
 * POST /api/github/repos/:owner/:repo/pulls — open a PR (returns the existing one if already open).
 */
export default handle(["GET", "POST"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const base = `/repos/${owner}/${repo}`;

  if (req.method === "GET") {
    const head = parse(refSchema, new URL(req.url).searchParams.get("head"), "head");
    const { gh } = await githubForRequest(req);
    const { data } = await gh.get<GhPull[]>(`${base}/pulls`, { head: `${owner}:${head}`, state: "open", per_page: 5 });
    const body: PullListResponse = { pulls: data.map(mapPull) };
    return json(body);
  }

  assertSameOrigin(req);
  const { gh, session } = await githubForRequest(req);
  rateLimit(`git-pr:${session.user.id}`, 10, 60_000);
  const input = await readJson(req, createSchema, 80_000);
  try {
    const { data } = await gh.send<GhPull>("POST", `${base}/pulls`, input);
    const body: PullRequestResponse = { pull: mapPull(data), existing: false };
    return json(body, { status: 201 });
  } catch (err) {
    if (isMessage(err, /already exists/i)) {
      const { data } = await gh.get<GhPull[]>(`${base}/pulls`, { head: `${owner}:${input.head}`, base: input.base, state: "open", per_page: 1 });
      if (data[0]) return json({ pull: mapPull(data[0]), existing: true } satisfies PullRequestResponse);
    }
    if (isMessage(err, /no commits between/i)) throw new HttpError(422, "NO_CHANGES", `${input.head} has no commits that aren't already on ${input.base}.`);
    if (isMessage(err, /draft pull requests are not supported/i)) throw new HttpError(422, "VALIDATION_FAILED", "Draft pull requests aren't available for this repository's plan.");
    throw err;
  }
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/pulls" };
