import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { commitChanges, commitRequestSchema, MAX_COMMIT_BODY } from "../lib/git";
import { assertSameOrigin, rateLimit } from "../lib/security";
import { readJson, repoParams } from "../lib/validate";
import type { CommitRequest } from "../../src/types/github";

/**
 * POST /api/github/repos/:owner/:repo/commit — commit workspace changes (one commit, fast-forward
 * only). Optionally creates the working branch first. The default branch needs `allowDefaultBranch`.
 */
export default handle(["POST"], async (req, ctx) => {
  assertSameOrigin(req);
  const { owner, repo } = repoParams(ctx.params);
  const { gh, session } = await githubForRequest(req);
  rateLimit(`git-commit:${session.user.id}`, 20, 60_000);
  const body = (await readJson(req, commitRequestSchema, MAX_COMMIT_BODY)) as CommitRequest;
  return json(await commitChanges(gh, owner, repo, body));
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/commit" };
