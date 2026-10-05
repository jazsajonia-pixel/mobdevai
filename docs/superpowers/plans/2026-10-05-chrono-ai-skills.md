# Chrono AI Reliability, Attachments, Skills, and Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Chrono use real Gemini model IDs from the supplied API key, support file/image attachments in AI messages, remove demo/fake-AI messaging, add custom skills, and refresh the palette to match the Chrono logo.

**Architecture:** Keep provider secrets server-side in Netlify environment variables and never commit or return them. Extend the existing agent message protocol with bounded attachment parts, keep repository-file attachments as structured data, and add a local custom-skills catalog that is injected into the server system prompt through a validated request field. Preserve the existing provider abstraction and workspace proposal flow.

**Tech Stack:** React, TypeScript, Vite, Netlify Functions, Zod, Gemini `generateContent` API, existing provider store and workspace context.

**Spec:** User request in conversation on 2026-10-05.

## Global Constraints

- The product name remains exactly **Chrono** and the supplied Chrono logo remains the brand asset.
- The supplied Gemini API key must be stored only as a Netlify secret; it must not enter Git, browser storage, logs, or chat output.
- Gemini model labels must use actual model IDs returned by the Gemini API; remove fictional `Chrono 1.x` and `Claude 3.N` labels.
- Keep file/image upload sizes bounded and reject unsupported or oversized inputs before network calls.
- Preserve existing server-side key handling, same-origin checks, rate limits, provider storage, and proposal approval behavior.

## Review Focus

- A Gemini key that lists models but uses a `models/...` name must normalize correctly for both listing and generation.
- A Gemini request with an image attachment must send valid inline image data and preserve text-only compatibility.
- An attachment that is too large, unsupported, or malformed must fail locally with a useful message.
- A custom skill must not allow arbitrary prompt injection to bypass server tool allow-lists.
- Removing demo entry points must not break existing authenticated project routes or tests that use the demo fixture internally.

---

### Task 1: Secure Gemini production configuration and real model catalog

**Files:**
- Modify: `netlify/functions/ai-providers.ts`, `netlify/lib/ai/resolve.ts`, `netlify/lib/ai/adapters.ts`, `src/lib/ai-catalog.ts`, `src/features/ai/provider-form.tsx`
- Modify: `netlify/tests/ai.test.ts`, `src/ai-providers.test.tsx`

**Interfaces:**
- Produces a platform Gemini provider backed by `GEMINI_API_KEY` when configured, with model IDs discovered from the API and no fictional aliases.

- [ ] Add a platform-provider model discovery test using a mocked Gemini `/models` response containing `models/gemini-2.5-flash` and assert the public model is `gemini-2.5-flash`.
- [ ] Normalize Gemini model values by stripping an optional `models/` prefix before URL construction, validation, persistence display, and `modelListed` comparison.
- [ ] Make Gemini generation use the normalized model ID and accept current Gemini model names with hyphens, dots, and underscores.
- [ ] Add the production platform Gemini provider only when `GEMINI_API_KEY` exists, with a discovered/validated default rather than a fictional fallback.
- [ ] Replace all fake `Chrono 1.x`, `Claude 3.N`, and similar labels in catalog defaults and tests with real provider IDs.
- [ ] Store the user-supplied Gemini key in Netlify production environment as `GEMINI_API_KEY` with secret scope, without writing it to local files.
- [ ] Run focused AI provider tests and verify the key is absent from tracked files and client bundles.

### Task 2: File and image attachments in AI conversations

**Files:**
- Modify: `src/types/agent.ts`, `src/features/agent/composer.tsx`, `src/features/agent/use-agent.ts`, `src/features/agent/agent-panel.tsx`, `src/features/agent/task.ts`
- Modify: `netlify/functions/ai-agent.ts`, `netlify/lib/ai/adapters.ts`, `netlify/lib/ai/agent-step.ts`
- Create/modify tests: `src/agent-attachments.test.tsx`, `netlify/tests/ai-agent.test.ts`

**Interfaces:**
- Add bounded `AgentAttachment` data with `name`, `mimeType`, `dataUrl` or text content, and byte/character limits.
- `AgentMessage` user content may be text plus optional structured attachments while remaining backward-compatible with existing stored text messages.

- [ ] Add a file input with `accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.py,.sql"`, multiple selection, and a visible attachment tray in Composer.
- [ ] Read selected files in the browser, enforce per-file and total limits, show removable attachment chips, and send the attachment metadata with the message.
- [ ] Preserve existing `@file` repository attachment behavior and distinguish repository files from uploaded files in the timeline.
- [ ] Extend the server schema and agent protocol to validate attachment count, MIME type, filename, and encoded size.
- [ ] Convert text uploads into fenced text context and image uploads into Gemini inline image parts; keep a safe text fallback for providers that do not support vision.
- [ ] Ensure OpenAI-compatible and Anthropic adapters do not crash on attachment-bearing messages; represent unsupported images as a clear text note.
- [ ] Add tests for successful text/image attachment serialization, removal, oversize rejection, and provider request shape.

### Task 3: Custom Skills feature

**Files:**
- Create: `src/lib/skills.ts`, `src/features/skills/skill-picker.tsx`, `src/pages/skills.tsx`
- Modify: `src/lib/nav.ts`, `src/App.tsx`, `src/features/agent/agent-panel.tsx`, `src/features/agent/use-agent.ts`, `src/types/agent.ts`, `netlify/functions/ai-agent.ts`, `netlify/lib/ai/agent-prompt.ts`
- Create/modify tests: `src/skills.test.tsx`, `netlify/tests/ai-agent.test.ts`

**Interfaces:**
- `CustomSkill = { id: string; name: string; description: string; instructions: string; enabled: boolean }` stored as non-secret local user configuration.
- Agent requests carry `skillIds: string[]`; the server resolves only known built-in skill definitions and injects their instructions into the system prompt.

- [ ] Add initial custom skills: `code-review`, `debugging`, `accessibility`, and `mobile-ui`, each with short bounded instructions and explicit limits.
- [ ] Add a Skills page and sidebar route with toggles and descriptions; persist only enabled skill IDs, never arbitrary executable code.
- [ ] Add a skill picker to the agent header/composer and include selected IDs in agent requests.
- [ ] Validate skill IDs server-side and compose skill instructions after the core safety/tool policy so skills cannot expand tool permissions.
- [ ] Add tests for enabling/disabling skills and server rejection of unknown IDs.

### Task 4: Remove demo/fake-AI entry points and refresh palette

**Files:**
- Modify: `src/pages/landing.tsx`, `src/features/agent/agent-panel.tsx`, `src/features/agent/use-agent.ts`, `src/lib/nav.ts`, `src/index.css`, `src/components/layout/app-shell.tsx`
- Modify: `src/app.test.tsx`, `src/agent-flow.test.tsx`, `src/a11y.test.tsx`

- [ ] Remove the landing-page Try Demo button and demo CTA copy while preserving Sign in/Start Building.
- [ ] Remove user-visible `Simulated AI` and Demo badges from the production agent UI; retain internal demo fixtures only where tests require them.
- [ ] Remove fake AI catalog names and stale demo claims from visible copy.
- [ ] Tune the palette to the logo: deep navy background/sidebar, electric blue primary, cyan secondary highlights, cool white surfaces, and high-contrast text.
- [ ] Preserve the existing Chrono logo asset in wordmark and favicon.
- [ ] Add/update accessibility assertions for the removed CTA, skills navigation, and new color-dependent controls.

### Task 5: Full validation and release

**Files:**
- Modify: `docs/superpowers/plans/2026-10-05-chrono-ai-skills.md`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --reporter=dot`.
- [ ] Run `npm run build` and inspect warnings for newly introduced issues.
- [ ] Run `git diff --check` and scan for fake model names and secret-like strings.
- [ ] Commit on a new feature branch, merge fast-forward into `main`, push, deploy Netlify, and verify `/api/health` plus the deployed Chrono site.
