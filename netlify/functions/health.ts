import type { Config } from "@netlify/functions";
import { capabilities, readiness } from "../lib/env.js";
import pkg from "../../package.json" with { type: "json" };
import { handle, json } from "../lib/http.js";
import { geminiPoolInfo } from "../lib/ai/gemini-pool.js";
import { perKeyModelReport } from "../lib/ai/gemini-availability.js";
import { rateLimit } from "../lib/security.js";
import { DEFAULT_GEMINI_MODEL } from "../../src/lib/gemini-models.js";

export const PHASE = 8;

/**
 * GET /api/health — uptime checks and deploy verification. Reports booleans and check ids only,
 * never configuration values. `ready` is false when a production-blocking check fails.
 */
export default handle(["GET"], async (req, ctx) => {
  const r = readiness();
  const pool = geminiPoolInfo(DEFAULT_GEMINI_MODEL);
  // ?gemini=1 → per-key models.list check (free, no generation quota). Counts only.
  let geminiModels: Awaited<ReturnType<typeof perKeyModelReport>> | undefined;
  if (new URL(req.url).searchParams.get("gemini") === "1" && pool.configured) {
    const ip = ctx?.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await rateLimit(`health-gemini:${ip}`, 3, 60_000);
    geminiModels = await perKeyModelReport();
  }
  return json({
    ok: true,
    service: "chrono",
    phase: PHASE,
    version: pkg.version,
    commit: (process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    context: process.env.CONTEXT ?? process.env.VERCEL_ENV ?? null,
    time: new Date().toISOString(),
    ready: r.ready,
    failing: r.checks.filter((c) => !c.ok).map((c) => ({ id: c.id, level: c.level })),
    capabilities: capabilities(),
    mobileAuth: true,
    gemini: { keys: pool.configured, invalid: pool.invalid, coolingDefaultModel: pool.cooling, defaultModel: DEFAULT_GEMINI_MODEL, ...(geminiModels ? { availability: geminiModels } : {}) },
  });
});

export const config: Config = { path: "/api/health" };
