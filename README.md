# Mobile Development AI

> The first AI development environment built for developers who code from their phone.

A mobile-first web IDE and AI coding agent: connect GitHub, pick a repository, ask the AI for a change,
review the diff, preview the real app, and commit/push/open a PR — without a desktop.

**Status: Phase 7 (polish — task history, project dashboard, offline/patch export, security & accessibility review) complete.** See [docs/PHASES.md](docs/PHASES.md) for what works today and what's next.

## Stack

- React 18 + TypeScript + Vite 6, Tailwind CSS 3 (shadcn-style primitives), `wouter` hash routing
- CodeMirror 6 editor, `diff` for change review; workspaces persisted per repo + branch in `localStorage`
- Netlify hosting + Netlify Functions (TypeScript) for everything that touches secrets
- Vitest + Testing Library

## Getting started

```bash
npm install
cp .env.example .env     # placeholders only — fill in locally, never commit
npm run dev:api          # Netlify Functions on :8787 (reads .env)
npm run dev              # Vite on :5173, proxies /api → :8787
# or: npx netlify dev    # full Netlify emulation on http://localhost:8888
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (UI only) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | `tsc -b` across app, config and functions |
| `npm test` | Unit + component tests |
| `npm run check` | typecheck + tests + build (run before every push) |
| `npm run dev:api` | Run Netlify Functions locally on :8787 |
| `npm run dev:mock-github` | Fake GitHub for local end-to-end testing |
| `npm run db:migrate` | Apply `db/migrations/*.sql` to `DATABASE_URL` |

### Try sign-in locally without real credentials

```bash
npm run dev:mock-github  # fake GitHub on :8790
# in .env:
#   GITHUB_CLIENT_ID=mock-id  GITHUB_CLIENT_SECRET=mock-secret  SESSION_SECRET=<32+ chars>
#   GITHUB_API_URL=http://127.0.0.1:8790/api  GITHUB_WEB_URL=http://127.0.0.1:8790
#   VITE_GITHUB_WEB_URL=http://127.0.0.1:8790
npm run dev:api & npm run dev
```

## Deploying to Netlify

1. New site → import this repository. Build command and publish dir come from `netlify.toml`.
2. Create a GitHub OAuth App (GitHub → Settings → Developer settings → OAuth Apps):
   - Homepage URL: `https://<your-site>.netlify.app`
   - Authorization callback URL: `https://<your-site>.netlify.app/api/auth/github/callback`
3. In **Site configuration → Environment variables** set `APP_URL`, `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -base64 32`), and optionally `DATABASE_URL`.
   For AI keys that persist across sign-outs and devices, also set `ENCRYPTION_KEY` (`openssl rand -base64 32`)
   together with `DATABASE_URL`; without them, keys users add are session-only (encrypted cookie).
4. Optional: `DATABASE_URL=… npm run db:migrate` to create the Neon tables (incl. `ai_providers`).
5. Redeploy, open the site on your phone, and sign in.

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
- The GitHub token lives only inside an AES-GCM encrypted HTTP-only cookie; `/api/auth/session` returns the profile, never the token.
- User AI keys are encrypted (AES-256-GCM) and never returned to the browser — only a masked hint. Custom base URLs are SSRF-checked.
- `/api/health` reports configuration as booleans — never values. Tests assert secrets don't leak.
- `.env*` files are git-ignored; only `.env.example` with placeholders is committed.
- Repository content is untrusted data: never executed on the server, never treated as instructions for the AI.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
