import type { Config } from "@netlify/functions";
import { capabilities } from "../lib/env";
import { json, methodNotAllowed } from "../lib/http";

export const PHASE = 0;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return methodNotAllowed(["GET"]);
  return json({
    ok: true,
    service: "mobile-development-ai",
    phase: PHASE,
    time: new Date().toISOString(),
    capabilities: capabilities(),
  });
};

export const config: Config = { path: "/api/health" };
