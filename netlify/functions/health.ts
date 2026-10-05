import type { Config } from "@netlify/functions";
import { capabilities, readiness } from "../lib/env";
import pkg from "../../package.json" with { type: "json" };
import { handle, json } from "../lib/http";

export const PHASE = 8;

/**
 * GET /api/health — uptime checks and deploy verification. Reports booleans and check ids only,
 * never configuration values. `ready` is false when a production-blocking check fails.
 */
export default handle(["GET"], async () => {
  const r = readiness();
  return json({
    ok: true,
    service: "chrono",
    phase: PHASE,
    version: pkg.version,
    commit: (process.env.COMMIT_REF ?? "").slice(0, 7) || null,
    context: process.env.CONTEXT ?? null,
    time: new Date().toISOString(),
    ready: r.ready,
    failing: r.checks.filter((c) => !c.ok).map((c) => ({ id: c.id, level: c.level })),
    capabilities: capabilities(),
  });
});

export const config: Config = { path: "/api/health" };
