import type { Config } from "@netlify/functions";
import { HttpError, handle, json } from "../lib/http";
import { githubForRequest } from "../lib/gh-request";
import { looksBinary } from "../lib/github";
import { parse, pathSchema, refSchema, repoParams } from "../lib/validate";
import type { FileResponse } from "../../src/types/github";

export const MAX_FILE_BYTES = 1024 * 1024;

interface GhContent {
  type: "file" | "dir" | "symlink" | "submodule";
  path: string;
  sha: string;
  size: number;
  encoding?: "base64" | "none";
  content?: string;
}

/** GET /api/github/repos/:owner/:repo/file?path=…&ref=… — a single text file (≤ 1 MB). */
export default handle(["GET"], async (req, ctx) => {
  const { owner, repo } = repoParams(ctx.params);
  const sp = new URL(req.url).searchParams;
  const path = parse(pathSchema, sp.get("path"), "path");
  const ref = parse(refSchema, sp.get("ref"), "ref");
  const { gh } = await githubForRequest(req);

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await gh.get<GhContent | GhContent[]>(`/repos/${owner}/${repo}/contents/${encodedPath}`, { ref });
  if (Array.isArray(data) || data.type !== "file") throw new HttpError(422, "VALIDATION_FAILED", "That path is not a file.");
  if (data.size > MAX_FILE_BYTES || data.encoding !== "base64" || data.content === undefined) {
    throw new HttpError(413, "FILE_TOO_LARGE", `${path} is ${Math.round(data.size / 1024)} KB — the limit is 1 MB.`);
  }

  const bytes = new Uint8Array(Buffer.from(data.content, "base64"));
  if (looksBinary(bytes)) throw new HttpError(415, "BINARY_FILE", `${path} is a binary file.`);

  const body: FileResponse = { path: data.path, ref, sha: data.sha, size: data.size, content: new TextDecoder().decode(bytes) };
  return json(body);
});

export const config: Config = { path: "/api/github/repos/:owner/:repo/file" };
