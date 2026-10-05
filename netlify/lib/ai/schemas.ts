import { z } from "zod";

export const kindSchema = z.enum(["openai", "anthropic", "gemini", "groq", "openai-compatible"]);
export const modelSchema = z.string().trim().regex(/^[\w.\-:/@ ]{1,120}$/, "Model names use letters, numbers, spaces and . - _ : / @");
export const labelSchema = z.string().trim().min(1).max(60);
export const apiKeySchema = z
  .string()
  .trim()
  .min(8, "API key looks too short")
  .max(512, "API key looks too long")
  .regex(/^\S+$/, "API key can't contain spaces");
export const baseUrlSchema = z.string().trim().max(300).nullable().optional();
export const providerIdSchema = z.string().regex(/^(p_[A-Za-z0-9_-]{8,32}|platform:(openai|anthropic|gemini))$/, "Invalid provider id");

export const createSchema = z
  .object({
    kind: kindSchema,
    label: labelSchema.optional(),
    model: modelSchema,
    baseUrl: baseUrlSchema,
    apiKey: apiKeySchema,
    enabled: z.boolean().default(true),
    makeDefault: z.boolean().default(false),
  })
  .strict();

export const patchSchema = z
  .object({
    label: labelSchema.optional(),
    model: modelSchema.optional(),
    baseUrl: baseUrlSchema,
    apiKey: apiKeySchema.optional(),
    enabled: z.boolean().optional(),
    makeDefault: z.boolean().optional(),
  })
  .strict();

/** Test a saved provider by id, or unsaved settings (the key is sent once, over HTTPS, and not stored). */
export const testSchema = z.union([
  z.object({ id: providerIdSchema, model: modelSchema.optional() }).strict(),
  z.object({ kind: kindSchema, model: modelSchema, baseUrl: baseUrlSchema, apiKey: apiKeySchema }).strict(),
  // Editing a saved provider: new model/base URL with the stored key.
  z.object({ id: providerIdSchema, model: modelSchema, baseUrl: baseUrlSchema }).strict(),
]);
