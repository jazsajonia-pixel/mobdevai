import type { Config } from "@netlify/functions";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, GEMINI_SERVER_MODELS, effectiveGeminiModel, isGeminiServerModel } from "../../src/lib/gemini-models.js";
import { HttpError, handle, json } from "../lib/http.js";
import { db } from "../lib/db.js";
import { requireSession } from "../lib/session.js";
import { assertSameOrigin, rateLimit } from "../lib/security.js";
import { readJson } from "../lib/validate.js";
import { geminiKeys } from "../lib/ai/gemini-pool.js";

const modelBody = z.object({ model: z.string().trim().min(1).max(120) }).strict();

async function userId(session: Awaited<ReturnType<typeof requireSession>>): Promise<number> {
  const sql = db();
  if (!sql) throw new HttpError(503, "AI_NOT_CONFIGURED", "Account-synced Gemini settings require database storage.");
  const rows = (await sql`
    INSERT INTO users (github_id, login, name, avatar_url)
    VALUES (${session.user.id}, ${session.user.login}, ${session.user.name}, ${session.user.avatarUrl})
    ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login
    RETURNING id`) as { id: number }[];
  if (rows[0]?.id === undefined) throw new HttpError(500, "INTERNAL", "Couldn't load your account.");
  return rows[0].id;
}

async function currentModel(session: Awaited<ReturnType<typeof requireSession>>): Promise<string> {
  const sql = db();
  if (!sql) return DEFAULT_GEMINI_MODEL;
  const id = await userId(session);
  const rows = (await sql`SELECT ai_gemini_model FROM users WHERE id = ${id}`) as { ai_gemini_model: string | null }[];
  return effectiveGeminiModel(rows[0]?.ai_gemini_model);
}

export default handle(["GET", "PATCH"], async (req) => {
  if (req.method === "PATCH") assertSameOrigin(req);
  const session = await requireSession(req);
  await rateLimit(`ai-gemini-model:${session.user.id}`, 30, 60_000);
  const keys = geminiKeys();
  if (!keys.length) throw new HttpError(503, "AI_NOT_CONFIGURED", "The server Gemini provider is not configured.");
  const id = await userId(session);
  if (req.method === "PATCH") {
    const body = await readJson(req, modelBody);
    if (!isGeminiServerModel(body.model)) throw new HttpError(422, "VALIDATION_FAILED", "That Gemini model is not available in Chrono.");
    const sql = db();
    if (!sql) throw new HttpError(503, "AI_NOT_CONFIGURED", "Account-synced Gemini settings require database storage.");
    await sql`UPDATE users SET ai_gemini_model = ${body.model} WHERE id = ${id}`;
  }
  const selected = await currentModel(session);
  return json({ model: selected, defaultModel: DEFAULT_GEMINI_MODEL, models: GEMINI_SERVER_MODELS.map((model) => ({ id: model, available: true })) });
});

export const config: Config = { path: "/api/ai/platform/gemini" };
