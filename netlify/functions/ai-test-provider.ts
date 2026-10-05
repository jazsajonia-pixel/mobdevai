import type { Config } from "@netlify/functions";
import type { ProviderTestResult, TestProviderResponse } from "../../src/types/ai";
import { HttpError, handle, json } from "../lib/http";
import { requireSession } from "../lib/session";
import { assertSameOrigin, rateLimit } from "../lib/security";
import { readJson } from "../lib/validate";
import { testSchema } from "../lib/ai/schemas";
import { testProvider, type ResolvedProvider } from "../lib/ai/adapters";
import { cleanBaseUrl } from "../lib/ai/handlers";
import { resolveProvider } from "../lib/ai/resolve";
import { openStore } from "../lib/ai/store";
import { findProvider, recordTest } from "../lib/ai/state";

/**
 * POST /api/ai/test-provider
 *   { id }                          test a saved/platform provider
 *   { id, model, baseUrl? }         test edits to a saved provider with its stored key
 *   { kind, model, baseUrl?, apiKey } test before saving (key used once, not stored)
 * Lists models (validates the key) then makes a tiny generation (validates the model).
 */
export default handle(["POST"], async (req) => {
  assertSameOrigin(req);
  const session = await requireSession(req);
  await rateLimit(`ai-test:${session.user.id}`, 10, 60_000);
  const body = await readJson(req, testSchema);

  let target: ResolvedProvider;
  let savedId: string | null = null;
  if ("apiKey" in body) {
    target = { kind: body.kind, model: body.model, effort: "medium", baseUrl: cleanBaseUrl(body.kind, body.baseUrl), apiKey: body.apiKey };
  } else {
    const r = await resolveProvider(req, session, body.id);
    const editing = "model" in body && body.model !== undefined;
    target = {
      ...r,
      model: body.model ?? r.model,
      baseUrl: "baseUrl" in body && body.baseUrl !== undefined ? cleanBaseUrl(r.kind, body.baseUrl) : r.baseUrl,
    };
    // Only remember the result when testing exactly what's saved.
    if (!body.id.startsWith("platform:") && (!editing || target.model === r.model)) savedId = body.id;
  }

  const record = async (result: ProviderTestResult): Promise<string[]> => {
    if (!savedId) return [];
    try {
      const store = openStore(req, session);
      const state = await store.load();
      findProvider(state, savedId);
      return await store.save(recordTest(state, savedId, result), state);
    } catch {
      return []; // recording the result is best effort
    }
  };

  try {
    const r = await testProvider(target);
    const cookies = await record({ ok: true, at: new Date().toISOString(), latencyMs: r.latencyMs });
    const out: TestProviderResponse = { ok: true, ...r };
    return json(out, { cookies });
  } catch (err) {
    if (err instanceof HttpError) {
      const cookies = await record({ ok: false, at: new Date().toISOString(), code: err.code, message: err.message });
      throw new HttpError(err.status, err.code, err.message, cookies, err.headers);
    }
    throw err;
  }
});

export const config: Config = { path: "/api/ai/test-provider" };
