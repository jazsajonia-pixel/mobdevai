import type { Config } from "@netlify/functions";
import { capabilities } from "../lib/env";
import { handle, json } from "../lib/http";

export const PHASE = 1;

export default handle(["GET"], async () =>
  json({
    ok: true,
    service: "mobile-development-ai",
    phase: PHASE,
    time: new Date().toISOString(),
    capabilities: capabilities(),
  }),
);

export const config: Config = { path: "/api/health" };
