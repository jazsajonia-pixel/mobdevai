import { z } from "zod";
import { HttpError } from "./http";

/** GitHub owner / repository names. */
export const ownerSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Invalid owner");
export const repoSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/, "Invalid repository name").refine((v) => v !== "." && v !== "..");

/** Git ref names (subset of git-check-ref-format rules). */
export const refSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((v) => !/(\.\.|[\x00-\x20~^:?*[\\]|@\{|\/\/|^\/|\/$|\.lock$|\.$)/.test(v), "Invalid branch or ref");

/** Repository-relative file path. No absolute paths, no traversal. */
export const pathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((v) => !v.startsWith("/") && !v.split("/").some((s) => s === "" || s === "." || s === ".."), "Invalid path")
  .refine((v) => !/[\x00-\x1f]/.test(v), "Invalid path");

export function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(422, "VALIDATION_FAILED", `${label}: ${r.error.issues[0]?.message ?? "invalid"}`);
  return r.data;
}

export function repoParams(params: Record<string, string> | undefined): { owner: string; repo: string } {
  return {
    owner: parse(ownerSchema, params?.owner, "owner"),
    repo: parse(repoSchema, params?.repo, "repo"),
  };
}

/** Read a JSON body (default ≤ 16 KB) and validate it. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxChars = 16_384): Promise<T> {
  const raw = await req.text();
  if (raw.length > maxChars) throw new HttpError(413, "VALIDATION_FAILED", "Request body is too large.");
  let value: unknown = {};
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new HttpError(422, "VALIDATION_FAILED", "Body must be JSON.");
    }
  }
  return parse(schema, value, "body");
}
