import type { Config } from "@netlify/functions";
import { effectiveEnabled, type SkillsResponse, type SkillsState } from "../../src/lib/skills.js";
import { handle, json } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { assertSameOrigin, rateLimit } from "../lib/security.js";
import { readJson } from "../lib/validate.js";
import { sanitizeSkills, skillsStateSchema, skillsStore } from "../lib/skills-store.js";

const body = (state: SkillsState, storage: SkillsResponse["storage"]): SkillsResponse => ({
  custom: state.custom,
  enabled: effectiveEnabled(state),
  storage,
});

/**
 * GET /api/skills → { custom, enabled, storage }
 * PUT /api/skills { custom, enabled } → replaces the user's custom skills + enabled ids.
 */
export default handle(["GET", "PUT"], async (req) => {
  const session = await requireSession(req);
  const store = skillsStore(req, session);
  if (req.method === "GET") return json(body(await store.load(), store.mode));

  assertSameOrigin(req);
  await rateLimit(`skills:${session.user.id}`, 30, 60_000);
  const input = await readJson(req, skillsStateSchema, 64_000);
  const prev = await store.load();
  const next = sanitizeSkills(input, prev);
  next.enabled = effectiveEnabled(next);
  const cookies = await store.save(next);
  return json(body(next, store.mode), { cookies });
});

export const config: Config = { path: "/api/skills" };
