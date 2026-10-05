# Chrono Studio UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Chrono from a flat utility dashboard into a polished AI development workspace while preserving existing routes, interactions, and accessibility.

**Architecture:** Keep the current React/Tailwind structure and data flows. Improve the visual system through shared CSS tokens and shell primitives, then redesign Home, Projects, AI, and workspace navigation/header surfaces without changing backend behavior. Add small reusable presentation components only where they reduce duplication.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, existing UI primitives, Vitest + Testing Library.

**Spec:** The user selected the Chrono Studio direction: dark IDE-inspired workspace, stronger project actions, cyan/blue Chrono accent, richer Home command center, improved AI/editor hierarchy, and preserved behavior.

## Global Constraints

- Preserve all existing routes, test IDs, and core behavior unless the visual change explicitly requires a test expectation update.
- Maintain WCAG AA contrast, visible focus states, and minimum 44px interactive targets.
- Use the existing Chrono logo and do not add external runtime dependencies.
- Keep light mode functional while making dark mode the visual reference state.
- Run `npm run check` before release.

## Review Focus

- Mobile sidebar remains usable and does not obscure content permanently.
- Existing demo and GitHub workspace flows still render with asynchronous loading.
- Theme tokens remain legible in both light and dark modes.
- New dashboard cards do not introduce inaccessible decorative images or duplicate labels.
- Existing test IDs and navigation semantics remain stable.

---

### Task 1: Establish Chrono Studio visual tokens

**Files:**
- Modify: `src/index.css`
- Test: existing `src/a11y.test.tsx`

**Interfaces:**
- Produces shared color, elevation, radius, and background utility classes used by later shell/page tasks.

- [ ] Add a navy/cyan Chrono Studio palette for dark mode, retaining readable light-mode fallbacks.
- [ ] Add shared utilities for subtle grid/noise backgrounds, elevated panels, glow accents, and active navigation states.
- [ ] Keep focus-visible and reduced-motion behavior intact.
- [ ] Run `npx vitest run src/a11y.test.tsx` and confirm no contrast/landmark regressions.

### Task 2: Upgrade the global AppShell

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/lib/nav.ts`
- Test: `src/app.test.tsx`, `src/a11y.test.tsx`

**Interfaces:**
- Keep `AppShell({ title, actions, children })` unchanged.
- Keep existing `data-testid` navigation selectors unchanged.

- [ ] Add grouped navigation labels for Workspace and Account without changing route targets.
- [ ] Add a compact account/theme/status footer area to the desktop sidebar.
- [ ] Add a stronger top bar with breadcrumb-like title treatment and retained action slot.
- [ ] Apply active nav indicator, icon container, and subtle background treatment.
- [ ] Preserve mobile overlay/toggle behavior and accessibility labels.
- [ ] Run app and accessibility tests.

### Task 3: Redesign the Home command center

**Files:**
- Modify: `src/pages/home.tsx`
- Test: `src/app.test.tsx`, new or updated focused assertions if needed.

**Interfaces:**
- Preserve demo and GitHub session behavior and existing project links.

- [ ] Add a hero command surface with “What are you building today?” and clear project-oriented actions.
- [ ] Add quick action cards for opening projects, trying the demo, configuring AI, and opening preview.
- [ ] Improve recent project cards with status dot, branch metadata, project type, and hover affordances.
- [ ] Keep the existing demo workspace card and repository behavior available.
- [ ] Use semantic headings and keyboard-focusable links/buttons.
- [ ] Run Home routing tests and accessibility checks.

### Task 4: Upgrade Projects and AI landing pages

**Files:**
- Modify: `src/pages/projects.tsx`
- Modify: `src/pages/ai.tsx`
- Test: existing page tests and accessibility tests.

**Interfaces:**
- Preserve GitHub repository search, pagination, provider link, recent task links, and empty/error states.

- [ ] Add page intro copy and visual summary cards without changing data behavior.
- [ ] Restyle repository rows as richer project cards with status, language, visibility, and branch treatments.
- [ ] Add AI provider status panel and task activity cards with clear model identity.
- [ ] Keep loading, empty, and error states visually consistent with the new tokens.
- [ ] Run targeted page tests and accessibility tests.

### Task 5: Upgrade the workspace shell

**Files:**
- Modify: `src/components/layout/workspace-shell.tsx`
- Modify: `src/pages/workspace.tsx` only if action wiring is needed.
- Test: `src/app.test.tsx`, `src/agent-flow.test.tsx`, `src/editor-flow.test.tsx`, `src/a11y.test.tsx`.

**Interfaces:**
- Preserve `WorkspaceShell` props and workspace tab route semantics.
- Preserve `data-testid` values for tab links, branch, repository name, and preview action.

- [ ] Add Chrono Studio header treatment with project identity, branch pill, status indicator, and primary Preview action.
- [ ] Add grouped workspace navigation with active cyan accent and Git change badge.
- [ ] Add secondary header actions for Ask/Run where they can be represented without changing behavior; do not introduce fake operations.
- [ ] Improve content panel framing and background separation while preserving editor layout constraints.
- [ ] Keep mobile sidebar and skip-link landmarks accessible.
- [ ] Run workspace flow and accessibility tests.

### Task 6: Validate, review, and release

**Files:**
- Modify: tests only if assertions describe intentionally changed presentation.

- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Inspect the production build output for warnings introduced by the redesign.
- [ ] Capture a local visual screenshot if the available preview tooling supports it.
- [ ] Review the final diff for accidental behavior changes and stale legacy branding.
- [ ] Commit the redesign on a new feature branch and report the commit and validation results.
