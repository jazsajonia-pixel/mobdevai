# Phases

## Phase 0 — Foundation ✅

Implemented:

- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind with dark-first theme + light mode
- Netlify config (`netlify.toml`), functions folder, security headers, `.env.example`
- Folder architecture for every later phase (`src/features/*`, `netlify/functions`)
- Error / loading / empty UI system, error boundary, offline banner
- Mobile shell: bottom navigation, workspace tabs, bottom sheet, 44px touch targets, safe-area insets
- Landing page with Start Building and Try Demo
- Sign-in screen wired to `POST /api/auth/github/start` (reports "not configured" / "Phase 1" cleanly)
- Protected routes, demo session, sign out with confirmation
- **Demo mode**: bundled Vite + React sample project, browsable file tree, file filter, read-only code
  viewer, persistent DEMO labelling, "nothing is pushed" messaging
- Settings: theme, live backend capability status from `/api/health`
- Functions: `health` (live), `auth-github-start` and `auth-session` (Phase 1 stubs)
- 24 tests: API error mapping, tree/project detection, nav, routing/guards/demo flow, functions incl. secret-leak check

Honest placeholders (marked with a Phase badge, no fake buttons): AI agent, provider settings, preview runtime, Git shipping.

## Phase 1 — Auth + GitHub (next)

`TODO(phase-1)` markers show where it plugs in:

- `netlify/functions/auth-github-start.ts` → issue `state` cookie, return authorize URL
- add `auth-github-callback.ts`, `auth-logout.ts`; encrypted HTTP-only session (`SESSION_SECRET`)
- `src/stores/session.tsx` → hydrate `github` mode from `GET /api/auth/session`
- add `github-repos`, `github-branches`, `github-tree`, `github-file` functions
- `src/pages/projects.tsx` / `workspace.tsx` → real repo list, branch picker, file tree
- Neon schema for `User` and `GitHubConnection`

Setup needed from you: a GitHub OAuth App (or GitHub App), a Netlify site, and the env vars in `.env.example`.

## Later phases

2 Mobile editor · 3 AI providers · 4 AI coding agent · 5 Live preview · 6 Git shipping · 7 Polish · 8 Production
