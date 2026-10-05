import type { Config } from "@netlify/functions";
import { PROVIDERS } from "../../src/lib/ai-catalog";
import { HttpError, handle } from "../lib/http";
import { readJson } from "../lib/validate";
import { createSchema } from "../lib/ai/schemas";
import { addProvider } from "../lib/ai/state";
import { cleanBaseUrl, maskKey, newProviderId, providerContext, respond, respondUnavailable } from "../lib/ai/handlers";

/**
 * GET  /api/ai/providers  → saved providers (masked) + storage mode + platform providers
 * POST /api/ai/providers  { kind, model, apiKey, baseUrl?, label?, enabled?, makeDefault? }
 * API keys go in once and are never returned.
 */
export default handle(["GET", "POST"], async (req) => {
  if (req.method === "GET") {
    try {
      const { store, state } = await providerContext(req, false);
      return respond(store, state);
    } catch (err) {
      if (err instanceof HttpError && err.code === "AI_NOT_CONFIGURED") return respondUnavailable();
      throw err;
    }
  }

  const { store, state } = await providerContext(req, true);
  const body = await readJson(req, createSchema);
  const id = newProviderId();
  const now = new Date().toISOString();
  const next = addProvider(
    state,
    {
      id,
      kind: body.kind,
      label: body.label ?? PROVIDERS[body.kind].name,
      model: body.model,
      effort: body.effort,
      baseUrl: cleanBaseUrl(body.kind, body.baseUrl),
      enabled: body.enabled,
      keyCipher: await store.encryptKey(body.apiKey, id),
      keyHint: maskKey(body.apiKey),
      lastTest: null,
      createdAt: now,
      updatedAt: now,
    },
    body.makeDefault,
    store.max,
  );
  const cookies = await store.save(next, state);
  return respond(store, next, cookies, 201);
});

export const config: Config = { path: "/api/ai/providers" };
