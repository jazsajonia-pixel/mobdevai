# Mobile Development AI

> The first AI development environment built for developers who code from their phone.

A mobile-first web IDE and AI coding agent: connect GitHub, pick a repository, ask the AI for a change,
review the diff, preview the real app, and commit/push/open a PR — without a desktop.

**Status: Phase 0 (Foundation) complete.** See [docs/PHASES.md](docs/PHASES.md) for what works today and what's next.

## Stack

- React 18 + TypeScript + Vite 6, Tailwind CSS 3 (shadcn-style primitives), `wouter` hash routing
- Netlify hosting + Netlify Functions (TypeScript) for everything that touches secrets
- Vitest + Testing Library

## Getting started

```bash
npm install
cp .env.example .env     # placeholders only — fill in locally, never commit
npm run dev              # frontend only (backend shows as "not reachable")
npx netlify dev          # frontend + functions on http://localhost:8888
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (UI only) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | `tsc -b` across app, config and functions |
| `npm test` | Unit + component tests |
| `npm run check` | typecheck + tests + build (run before every push) |

## Deploying to Netlify

1. New site → import this repository. Build command and publish dir come from `netlify.toml`.
2. Set environment variables in **Site settings → Environment variables** (see `.env.example`).
3. Phase 1 will require a GitHub OAuth App with callback `https://<your-site>/api/auth/github/callback`.

## Project layout

```
src/
  components/      shared UI (ui/ primitives, layout/ shells, states, error boundary)
  features/        auth · github · editor · ai · preview · git · settings · demo
  pages/           route screens
  hooks/ lib/ stores/ types/
netlify/
  functions/       one file per endpoint (config.path routes under /api/*)
  lib/             server-only helpers (env capability detection, JSON responses)
docs/              architecture, phases, security
```

## Security rules (non-negotiable)

- AI keys, GitHub secrets and session keys live **only** in Netlify Functions. Nothing secret uses a `VITE_` prefix.
- `/api/health` reports configuration as booleans — never values. A test asserts secrets don't leak.
- `.env*` files are git-ignored; only `.env.example` with placeholders is committed.
- Repository content is untrusted data: never executed on the server, never treated as instructions for the AI.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
