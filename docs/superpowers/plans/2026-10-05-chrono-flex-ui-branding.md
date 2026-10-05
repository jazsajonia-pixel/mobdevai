# Chrono Flex, Workspace UI, and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Groq to Chrono Flex, improve file and chat interactions, replace navigation bars with toggleable sidebars, remove build/demo status clutter, restore Gemini model names, and use the supplied Chrono logo throughout the site.

**Architecture:** Extend the existing provider catalog and OpenAI-compatible adapter path for Groq. Keep workspace mutations in the existing workspace context/model, expose deletion through the file tree, and make the shell/sidebar a shared responsive layout component. Preserve existing tests and add focused regression coverage for each user-visible behavior.

**Tech Stack:** React 18, TypeScript, Wouter, Tailwind utility classes, Lucide icons, Vitest/Testing Library, Netlify Functions, Neon-backed provider storage.

**Spec:** User request in the current task.

## Global Constraints

- The product name shown to users is `Chrono`.
- The supplied image is the Chrono logo asset; copy it into `public` and use it for favicon/wordmark imagery.
- Existing encrypted provider keys must remain decryptable; do not rotate `ENCRYPTION_KEY`.
- Groq uses its OpenAI-compatible API and must not require a custom base URL.
- Gemini model labels return to real-looking Gemini names rather than the fictional `Gemini 3.N` aliases.
- File deletion remains a local workspace change until the user commits/pushes it.
- The chat textarea grows with content and has a fixed maximum height with scrolling beyond it.

## Review Focus

- Provider kind validation, platform provider resolution, Groq API base URL, and model list/test behavior.
- Deleting a base file versus an added local file, including active tabs and unsaved drafts.
- Sidebar state on phone and desktop, keyboard/accessibility labels, and workspace navigation preservation.
- Long multiline chat requests, max-height scrolling, and Ctrl/Cmd+Enter submission.
- Accepted proposals no longer leave a visible Proposed changes summary when no pending changes remain.
- Logo rendering with transparent background and no stale Mobile Development AI wordmark.

---

### Task 1: Groq provider and Gemini catalog

**Files:**
- Modify: `src/types/ai.ts`, `src/lib/ai-catalog.ts`, `netlify/lib/ai/schemas.ts`, `netlify/lib/ai/adapters.ts`, `netlify/lib/ai/resolve.ts` as needed.
- Test: `src/lib/ai-catalog.test.ts`, `netlify/tests/ai.test.ts`, `netlify/tests/ai-agent.test.ts`.

**Interfaces:**
- Add `groq` to `ProviderKind` and provider metadata.
- Groq uses `https://api.groq.com/openai/v1`, a `gsk_…` placeholder, and OpenAI-compatible chat/model-list behavior.
- Restore Gemini suggestions to real-looking IDs such as `gemini-2.5-pro`, `gemini-2.5-flash`, and `gemini-2.0-flash` while retaining the existing Gemini adapter.

- [ ] Add failing catalog/schema/adapter tests for Groq and restored Gemini suggestions.
- [ ] Run focused provider tests and confirm failures identify missing Groq support.
- [ ] Implement provider enum/catalog, server kind schema, adapter routing, and model validation.
- [ ] Run focused provider tests and confirm Groq uses the OpenAI-compatible endpoint with the Groq key header behavior.
- [ ] Commit `feat: add Groq provider option`.

### Task 2: File deletion control

**Files:**
- Modify: `src/features/editor/file-tree.tsx`, `src/features/editor/files-browser.tsx`, `src/features/editor/editor-screen.tsx` if needed.
- Test: `src/editor-flow.test.tsx` and/or a focused file-tree test.

**Interfaces:**
- File rows expose `onDelete(path)` and render an accessible delete button.
- Deletion calls `ws.remove(path)`, closes/removes the active tab if necessary, and uses the existing `ConfirmSheet` before destructive deletion.

- [ ] Add a failing interaction test for deleting an added file and a base file.
- [ ] Implement row-level delete action with event propagation prevention and confirmation.
- [ ] Ensure active/deleted files leave the editor in a valid tree/editor state.
- [ ] Run editor tests and confirm deletion is local-only and represented in workspace changes.
- [ ] Commit `feat: add workspace file deletion control`.

### Task 3: Toggleable sidebar navigation

**Files:**
- Modify: `src/components/layout/app-shell.tsx`, `src/components/layout/workspace-shell.tsx`, `src/lib/nav.ts`, `src/index.css`.
- Test: `src/app.test.tsx`, `src/a11y.test.tsx`, workspace flow tests as needed.

**Interfaces:**
- Replace global bottom/rail navigation with a shared sidebar that has a labeled toggle button.
- Sidebar is open by default on desktop and collapsible; on phone it opens as an overlay/drawer and closes after navigation.
- Workspace tab navigation moves into the same sidebar pattern while retaining `data-testid` tab selectors and active route semantics.

- [ ] Add failing tests for the sidebar toggle, navigation links, and preserved active route.
- [ ] Implement responsive sidebar state and overlay behavior using existing React state and CSS utilities.
- [ ] Update shells to remove bottom nav/rail markup and ensure main content padding follows sidebar state.
- [ ] Run routing and accessibility tests.
- [ ] Commit `feat: replace nav bars with toggleable sidebars`.

### Task 4: Composer sizing and proposal cleanup

**Files:**
- Modify: `src/features/agent/composer.tsx`, `src/features/agent/agent-panel.tsx`, `src/features/agent/proposal-review.tsx`, `src/features/agent/use-agent.ts` if needed.
- Test: `src/agent-flow.test.tsx`, `src/features/agent/agent.test.ts`, proposal tests if needed.

**Interfaces:**
- Composer adjusts textarea height from content up to a CSS max height, then scrolls; it must recalculate on text changes and reset after send.
- `ProposalSummary` returns `null` after all proposed files are accepted or rejected, so the visible Proposed changes card disappears after approval.

- [ ] Add failing tests for multiline textarea growth/max behavior and disappearance of the proposal summary after acceptance.
- [ ] Implement textarea auto-resize using `scrollHeight`, `max-height`, and overflow behavior.
- [ ] Render proposal summary only while pending or while a meaningful review state remains, matching the requested hide-after-approval behavior.
- [ ] Run agent and proposal tests.
- [ ] Commit `feat: improve agent composer and proposal cleanup`.

### Task 5: Remove build/demo status clutter

**Files:**
- Modify: `src/pages/home.tsx`, `src/features/demo/roadmap.ts` references, `src/components/layout/demo-banner.tsx`, related landing/demo components and tests.
- Test: `src/app.test.tsx`, `src/a11y.test.tsx`.

**Interfaces:**
- Remove the Home page Build status/Roadmap section.
- Remove demo status/banner copy from the website while preserving safe demo behavior and clear local-only messaging where necessary.

- [ ] Add/update tests asserting Home does not render `Build status` or `list-roadmap` and demo routes do not render the removed banner.
- [ ] Remove the status section and demo banner usage/copy without breaking demo workspace behavior.
- [ ] Run routing/accessibility tests.
- [ ] Commit `refactor: remove build and demo status clutter`.

### Task 6: Chrono logo and final branding

**Files:**
- Add: `public/chrono-logo.png` copied from the supplied attachment.
- Modify: `src/components/brand.tsx`, `public/favicon.svg`, `index.html`, any stale user-facing branding files.
- Test: `src/app.test.tsx`, `src/a11y.test.tsx`, grep-based stale-brand check.

**Interfaces:**
- `Wordmark` displays the supplied logo image with `alt="Chrono"` and text `Chrono`.
- App shell/sidebar and landing/sign-in pages use the Chrono wordmark/logo.
- Page title, favicon, and metadata use `Chrono`; no visible `Mobile Development AI` remains.

- [ ] Add/update tests for the Chrono accessible logo/wordmark.
- [ ] Copy the supplied image into `public/chrono-logo.png`, wire it into branding/favicon/metadata, and remove stale visible naming.
- [ ] Run `rg` stale-brand check and the full test/build suite.
- [ ] Commit `feat: apply Chrono logo and final branding`.

### Task 7: Integration verification and deployment

**Files:**
- Modify: documentation only if deployment behavior changes.

- [ ] Run `npm run check` and verify typecheck, all tests, and production build.
- [ ] Inspect `git diff --check` and confirm the working tree is clean.
- [ ] Push the feature branch and fast-forward merge to `main` only if checks pass.
- [ ] Deploy to the existing Netlify production site.
- [ ] Verify deploy state `ready`, `/api/health` returns HTTP 200 with `ready: true`, `database: true`, and no failing checks.
