import type { Config } from "@netlify/functions";
import { z } from "zod";
import { HttpError, handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { isMessage, shaSchema } from "../lib/git";
import { assertSameOrigin, rateLimit } from "../lib/security";
import { readJson, refSchema, repoParams } from "../lib/validate";
import type { BranchSummary } from "../../src/types/github";

const schema = z.object({ name: refSchema, from: shaSchema });

/** POST /api/github/repos/:owner/:repo/branch — create a branch at a commit. Never overwrites one. */
export default handle(["POST"], async (req, ctx) => {
  assertSameOrigin(req);
  const { owner, repo } = repoParams(ctx.params);
  const { gh, session } = await githubForRequest(req);
  await rateLimit(`git-branch:${session.user.id}`, 20, 60_000);
  const { name, from } = await readJson(req, schema);
  try {
    await gh.send("POST", `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${name}`, sha: from });
  } catch (err) {
    if (isMessage(err, /already exists/i)) throw new HttpError(409, "BRANCH_EXISTS", `A branch named ${name} already exists.`);
    throw err;
  }
  const branch: BranchSummary = { name, sha: from, protected: false };
  return json({ branch }, { status: 201 });
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/branch" };
