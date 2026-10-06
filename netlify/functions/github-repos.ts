import type { Config } from "@netlify/functions";
import { z } from "zod";
import { HttpError, handle, json } from "../lib/http.js";
import { githubForRequest } from "../lib/gh-request.js";
import { hasNextPage, mapRepo, type GhRepo } from "../lib/github.js";
import { assertSameOrigin, rateLimit } from "../lib/security.js";
import { parse, readJson } from "../lib/validate.js";
import type { RepoListResponse } from "../../src/types/github.js";

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(50).default(1) });

/** GitHub's own rules: letters, digits, `-`, `_`, `.`; not `.`/`..`; at most 100 chars. */
export const repoNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a repository name.")
  .max(100, "Repository names can be at most 100 characters.")
  .regex(/^[A-Za-z0-9._-]+$/, "Use only letters, numbers, '-', '_' and '.'.")
  .refine((n) => n !== "." && n !== "..", "That name isn't allowed.");

const createSchema = z
  .object({
    name: repoNameSchema,
    description: z.string().trim().max(350).optional(),
    private: z.boolean().default(false),
    autoInit: z.boolean().default(true),
  })
  .strict();

/**
 * GET  /api/github/repos?page=N — repositories the user can access, most recently pushed first.
 * POST /api/github/repos { name, description?, private?, autoInit? } — create a repository on the user's account.
 */
export default handle(["GET", "POST"], async (req) => {
  if (req.method === "POST") {
    assertSameOrigin(req);
    const { gh, session } = await githubForRequest(req);
    await rateLimit(`github-create-repo:${session.user.id}`, 5, 60_000);
    const body = await readJson(req, createSchema);
    if (body.private && !session.includePrivate) {
      throw new HttpError(403, "FORBIDDEN", "Private repositories need private access. Sign out, then sign in with “Include private repositories”.");
    }
    // GitHub answers a duplicate name with a generic 422 — check first so the message is clear.
    const exists = await gh.get(`/repos/${encodeURIComponent(session.user.login)}/${encodeURIComponent(body.name)}`).then(
      () => true,
      (err: unknown) => {
        if (err instanceof HttpError && err.code === "NOT_FOUND") return false;
        throw err;
      },
    );
    if (exists) throw new HttpError(409, "REPO_EXISTS", `You already have a repository named ${body.name}.`);
    const { data: created } = await gh.send<GhRepo>("POST", "/user/repos", {
      name: body.name,
      description: body.description || undefined,
      private: body.private,
      auto_init: body.autoInit,
    });
    return json({ repo: mapRepo(created) }, { status: 201 });
  }

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
