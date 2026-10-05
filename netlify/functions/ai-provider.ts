import type { Config } from "@netlify/functions";
import { HttpError, handle } from "../lib/http";
import { parse, readJson } from "../lib/validate";
import { patchSchema, providerIdSchema } from "../lib/ai/schemas";
import { findProvider, removeProvider, setDefault, updateProvider, type StoredProvider } from "../lib/ai/state";
import { publicPlatform } from "../lib/ai/store";
import { cleanBaseUrl, maskKey, providerContext, respond } from "../lib/ai/handlers";

/**
 * PATCH  /api/ai/providers/:id  { label?, model?, baseUrl?, apiKey?, enabled?, makeDefault? }
 * DELETE /api/ai/providers/:id
 * Platform (server) providers can only be made default.
 */
export default handle(["PATCH", "DELETE"], async (req, ctx) => {
  const id = parse(providerIdSchema, ctx.params?.id, "id");
  const { store, state } = await providerContext(req, true);

  if (id.startsWith("platform:")) {
    if (req.method === "DELETE") throw new HttpError(403, "FORBIDDEN", "Server-provided providers can't be removed here.");
    const body = await readJson(req, patchSchema);
    if (!body.makeDefault || Object.keys(body).length !== 1) throw new HttpError(403, "FORBIDDEN", "Server-provided providers can only be set as default.");
    const next = setDefault(state, id, publicPlatform());
    return respond(store, next, await store.save(next, state));
  }

  if (req.method === "DELETE") {
    const next = removeProvider(state, id);
    return respond(store, next, await store.save(next, state));
  }

  const body = await readJson(req, patchSchema);
  const current = findProvider(state, id);
  const patch: Partial<StoredProvider> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.effort !== undefined) patch.effort = body.effort;
  if (body.model !== undefined && body.model !== current.model) {
    patch.model = body.model;
    patch.lastTest = null;
  }
  if (body.baseUrl !== undefined) {
    patch.baseUrl = cleanBaseUrl(current.kind, body.baseUrl);
    if (patch.baseUrl !== current.baseUrl) patch.lastTest = null;
  }
  if (body.apiKey !== undefined) {
    patch.keyCipher = await store.encryptKey(body.apiKey, id);
    patch.keyHint = maskKey(body.apiKey);
    patch.lastTest = null;
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled;

  let next = Object.keys(patch).length ? updateProvider(state, id, patch) : state;
  if (body.makeDefault) next = setDefault(next, id, publicPlatform());
  return respond(store, next, await store.save(next, state));
});

export const config: Config = { path: "/api/ai/providers/:id" };
