# Chrono Flex Model Management and Chat Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Gemini the honest Chrono default, keep Groq as a separate optional provider, and make Chrono Flex dynamically discover models from submitted API keys with persisted effort settings and a chat plus-menu for Skills/uploads.

**Architecture:** Extend the existing encrypted provider records with an `effort` field. Provider testing already lists models from the submitted key; the UI will make that flow explicit and only present fetched models as the primary-model choices. The chat composer will use a plus button to reveal Skills and, after Skills is enabled, the upload control.

**Tech Stack:** React, TypeScript, Vitest, Netlify Functions, Neon Postgres, Google Gemini Developer API.

**Spec:** User request in conversation, supported by official Google model/pricing pages.

## Global Constraints

- Never expose or persist API keys in browser storage or repository files.
- Groq must remain distinct from Gemini; no provider-name or model-name fakery.
- Gemini default model should be a real model ID available to the key; prefer `gemini-2.5-flash` as the free-tier-compatible fallback and use the key’s fetched model list when available.
- Provider model choices must come from the provider’s authenticated `/models` response after testing the submitted key.
- Effort values are `low`, `medium`, and `high`; map them to provider-native reasoning controls where supported.

## Review Focus

- Invalid or quota-limited keys must not be saved as valid providers.
- A provider with no model-list endpoint must still allow a manually entered model for OpenAI-compatible servers.
- Existing encrypted provider rows must migrate safely with a default effort.
- Gemini attachments must continue working with effort settings.
- The plus menu must not make upload controls permanently visible before Skills is toggled.

---

### Task 1: Provider persistence and real Gemini default

**Files:**
- Create: `db/migrations/005_provider_effort.sql`
- Modify: `src/types/ai.ts`, `netlify/lib/ai/state.ts`, `netlify/lib/ai/store.ts`, `netlify/lib/ai/resolve.ts`, `netlify/functions/ai-providers.ts`, `netlify/functions/ai-provider.ts`
- Modify: `src/lib/ai-catalog.ts`

- [ ] Add `effort` to provider input, patch, stored, resolved, and public types.
- [ ] Add an idempotent Neon migration with `effort TEXT NOT NULL DEFAULT 'medium'` and a check constraint for low/medium/high.
- [ ] Read/write effort through the encrypted provider store and provider mutation handlers.
- [ ] Set `AI_DEFAULT_PROVIDER=gemini` and `GEMINI_MODEL=gemini-2.5-flash` in Netlify production configuration; keep Groq separate.
- [ ] Update Gemini suggestions to current real model IDs: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, and `gemini-2.5-pro`.
- [ ] Test migration/state defaults and run the Neon migration.

### Task 2: Provider-native effort controls

**Files:**
- Modify: `netlify/lib/ai/adapters.ts`, `netlify/lib/ai/agent-step.ts`
- Test: `netlify/tests/ai.test.ts`, `netlify/tests/ai-agent.test.ts`

- [ ] Include `effort` in resolved providers and agent step payloads.
- [ ] Map Gemini effort to `thinkingConfig`: use `thinkingBudget` for Gemini 2.5 and `thinkingLevel` for Gemini 3.x where accepted.
- [ ] Map OpenAI effort to `reasoning_effort` when the selected model supports reasoning; do not send it to Groq by pretending Groq is Gemini.
- [ ] Preserve Anthropic and generic-compatible behavior without invalid unsupported fields.
- [ ] Add tests asserting provider-specific request bodies.

### Task 3: Dynamic Flex model selection UI

**Files:**
- Modify: `src/features/ai/provider-form.tsx`, `src/features/ai/provider-card.tsx`, `src/types/ai.ts`

- [ ] Make the new-provider flow clearly sequential: provider → API key → Test and fetch models → primary model → effort → save.
- [ ] For Gemini, OpenAI, Anthropic, and Groq, show fetched models returned by the submitted key; for OpenAI-compatible providers retain manual model entry if listing is unavailable.
- [ ] Add an effort selector with low/medium/high labels and concise help text.
- [ ] Persist selected model and effort through create/update calls.
- [ ] Ensure a failed test prevents saving a new provider.
- [ ] Add UI tests for fetched model selection and effort persistence.

### Task 4: Chat plus-menu Skills and upload flow

**Files:**
- Modify: `src/features/agent/composer.tsx`, `src/features/agent/agent-panel.tsx`
- Test: `src/agent-flow.test.tsx`

- [ ] Add a plus button beside the composer controls.
- [ ] Clicking plus opens a menu containing a Skills toggle.
- [ ] When Skills is toggled on, reveal the existing upload-files/images control.
- [ ] Keep enabled custom Skills included in the agent request and show selected skill chips in the menu.
- [ ] Keep upload validation limits and remove controls intact.
- [ ] Add tests for plus-menu visibility, Skills toggle, and upload-control visibility.

### Task 5: Verification and deployment

**Files:**
- Modify: `docs/DEPLOY.md` if the new environment variables need documentation.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --reporter=dot`.
- [ ] Run `npm run build`.
- [ ] Apply migration 005 to production Neon.
- [ ] Deploy the merged branch to Netlify production.
- [ ] Verify `/api/health`, deployment readiness, and Netlify secret scan.
