import type { Config } from "@netlify/functions";
import { z } from "zod";
import { handle } from "../lib/http";
import { log } from "../lib/log";
import { clientKey, rateLimit } from "../lib/security";
import { readJson } from "../lib/validate";

const reportSchema = z
  .object({
    kind: z.enum(["boundary", "error", "unhandledrejection"]),
    message: z.string().max(300),
    stack: z.string().max(4000).optional(),
    route: z.string().max(120),
    release: z.string().max(40),
  })
  .strict();

/**
 * POST /api/client-errors — crash reports from the browser (see src/lib/monitoring.ts).
 * No auth required (crashes can happen signed out), so it's same-origin only (handle()),
 * size-limited, rate-limited per client and logged through the redacting logger.
 */
export default handle(["POST"], async (req, ctx) => {
  await rateLimit(`client-errors:${clientKey(req, ctx)}`, 30, 60_000);
  const r = await readJson(req, reportSchema, 6_000);
  const ua = (req.headers.get("user-agent") ?? "").replace(/\s+/g, " ");
  const browser = /Mobile|Android|iPhone|iPad/.test(ua) ? "mobile" : "desktop";
  log("error", "client error", { kind: r.kind, message: r.message, stack: r.stack, route: r.route, release: r.release, browser });
  return new Response(null, { status: 204 });
});

export const config: Config = { path: "/api/client-errors" };
