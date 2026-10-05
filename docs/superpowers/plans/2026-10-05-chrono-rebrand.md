# Chrono Rebrand and Deployment Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Chrono product rename and fictional model catalog while preserving the existing Neon-backed encrypted provider-key persistence, then validate and merge the changes.

**Architecture:** Keep provider IDs and API adapters unchanged so real provider connections continue to work. Update only user-facing product copy and suggested/default display model aliases in the shared catalog; the server still uses the configured model string when calling the provider. Verify the existing Neon schema and deployment configuration without destructive database changes.

**Tech Stack:** React 18, TypeScript, Vite, Netlify Functions, Neon PostgreSQL, Vitest.

**Spec:** User-provided previous prompt: connect Neon and run migrations to persist Chrono Flex user keys; rename the project to Chrono; use default AI name `Chrono 1.0 to 1.3`; fictionalize other displayed model names such as Gemini 3.N; deploy after verification.

## Global Constraints

- Never expose or commit secrets.
- Preserve existing `openai`, `anthropic`, `gemini`, and `openai-compatible` provider kinds and API URLs.
- Keep the existing AES-256-GCM encryption and Neon persistence behavior unchanged unless tests reveal a defect.
- Do not run destructive SQL; verify the existing production Neon branch read-only.
- Do not claim a Netlify/Vercel deploy succeeded when the connector or app runtime cannot verify it.

## Review Focus

- Every visible product name must consistently say Chrono rather than Chrono.
- Default and suggested model strings must use the requested fictional Chrono naming without changing provider routing.
- A saved provider must still use the database mode when `DATABASE_URL` and `ENCRYPTION_KEY` are configured.
- Existing API adapter tests must continue to pass with model aliases.
- Netlify deployment configuration must remain valid; Vercel is not a drop-in target for Netlify Functions without a separate migration.

---

### Task 1: Rebrand user-facing product copy

**Files:**
- Modify: `index.html`, `src/pages/landing.tsx`, `src/pages/sign-in.tsx`, `src/pages/settings.tsx`, `src/pages/not-found.tsx`, `src/components/layout/app-shell.tsx`, `src/features/agent/agent-prompt.ts`, and other exact-match product-copy locations found by `rg`.
- Test: existing component tests plus a repository-wide exact-match check for stale product branding.

- [ ] Replace visible product-brand references with `Chrono` or `Chrono Flex` where the existing UI specifically names the provider-key feature.
- [ ] Keep historical migration comments and technical documentation references intact where they are not user-facing.
- [ ] Run `rg` and the full check suite.

### Task 2: Update the fictional model catalog

**Files:**
- Modify: `src/lib/ai-catalog.ts`.
- Test: `src/lib/ai-catalog.test.ts` (create if absent) or the nearest existing catalog/provider tests.

- [ ] Set the OpenAI default display model to `Chrono 1.0` and suggested display models to `Chrono 1.0`, `Chrono 1.1`, `Chrono 1.2`, and `Chrono 1.3`.
- [ ] Set the Anthropic default/suggestions to fictional `Claude 3.N` family aliases and Gemini default/suggestions to fictional `Gemini 3.N` family aliases, preserving provider kind and endpoint behavior.
- [ ] Assert exact catalog defaults and that provider kinds remain unchanged.
- [ ] Run targeted tests, typecheck, and production build.

### Task 3: Verify Neon persistence and deployment readiness

**Files:**
- Modify only if verification finds a code defect; otherwise no source change.
- Documentation may be updated to call the product Chrono and accurately describe the existing Netlify deployment target.

- [ ] Verify the production Neon `main` branch has `users`, `github_connections`, `ai_providers`, and `rate_limits` tables and the expected encrypted-key columns.
- [ ] Confirm migrations are present and idempotent; do not re-run destructive SQL.
- [ ] Run `npm run check` and, when credentials permit, `npm run verify:env` against the deployed health endpoint.
- [ ] Inspect Netlify project/deploy status through the connector; if authentication remains 401, record the blocker and do not invent a deployment result.
- [ ] Do not deploy to Vercel unless a compatible Vercel migration is explicitly implemented; the current app is Netlify Functions-based.

### Task 4: Branch, commit, push, and merge

**Files:**
- Git branch and commit metadata only.

- [ ] Create a feature branch from the verified `main` HEAD.
- [ ] Commit focused changes.
- [ ] Push the branch and merge it into `main` only after all checks pass.
- [ ] Re-run the final check on merged `main` and report commit/deployment status.
