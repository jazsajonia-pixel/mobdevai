import type { Config } from "@netlify/functions";
import { handle, json } from "../lib/http.js";
import { githubForRequest } from "../lib/gh-request.js";
import { commitChanges, commitRequestSchema, MAX_COMMIT_BODY } from "../lib/git.js";
import { assertSameOrigin, rateLimit } from "../lib/security.js";
import { readJson, repoParams } from "../lib/validate.js";
import type { CommitRequest } from "../../src/types/github.js";

/**
 * POST /api/github/repos/:owner/:repo/commit — commit workspace changes (one commit, fast-forward
 * only). Optionally creates the working branch first. The default branch needs `allowDefaultBranch`.
 */
export default handle(["POST"], async (req, ctx) => {
  assertSameOrigin(req);
  const { owner, repo } = repoParams(ctx.params);
  const { gh, session } = await githubForRequest(req);
  await rateLimit(`git-commit:${session.user.id}`, 20, 60_000);
  const body = (await readJson(req, commitRequestSchema, MAX_COMMIT_BODY)) as CommitRequest;
  return json(await commitChanges(gh, owner, repo, body));
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/commit" };
