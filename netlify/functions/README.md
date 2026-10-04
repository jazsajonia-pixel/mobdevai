# Netlify Functions

Server-side code. This is the only place secrets (GitHub client secret, AI provider keys,
session/encryption keys) may be read. Each `.ts` file here is one function with an explicit
`config.path` (tests live in `netlify/tests` so they are never deployed).

| Function | Route | Notes |
| --- | --- | --- |
| `health.ts` | `GET /api/health` | Configured capabilities as booleans only |
| `auth-github-start.ts` | `POST /api/auth/github/start` | Same-origin + rate limited. Seals a one-time `state` cookie, returns the authorize URL |
| `auth-github-callback.ts` | `GET /api/auth/github/callback` | Verifies state, exchanges code server-side, sets the encrypted session cookie |
| `auth-session.ts` | `GET /api/auth/session` | Profile + scopes. Never the token |
| `auth-logout.ts` | `POST /api/auth/logout` | Revokes the GitHub token (best effort), clears the cookie |
| `github-repos.ts` | `GET /api/github/repos?page=` | 50 per page, most recently pushed first |
| `github-repo.ts` | `GET /api/github/repos/:owner/:repo` | Metadata + your permissions |
| `github-branches.ts` | `GET /api/github/repos/:owner/:repo/branches` | Up to 300 |
| `github-tree.ts` | `GET /api/github/repos/:owner/:repo/tree?ref=` | Recursive, capped at 10,000 entries |
| `github-file.ts` | `GET /api/github/repos/:owner/:repo/file?ref=&path=` | Text only, ≤ 1 MB |
| `ai-providers.ts` | `GET, POST /api/ai/providers` | List (masked) + storage mode; create. Keys never returned |
| `ai-provider.ts` | `PATCH, DELETE /api/ai/providers/:id` | Edit / replace key / enable / default; remove |
| `ai-test-provider.ts` | `POST /api/ai/test-provider` | Saved (`{id}`) or unsaved settings; 10/min per user |
| `ai-agent.ts` | `POST /api/ai/agent` | One agent step (Ask = chat, Agent = plan + edits) with native tool calling; 40/min per user |

Shared helpers in `netlify/lib`: `crypto` (AES-GCM seal/unseal), `session`, `cookies`, `security`
(same-origin check, rate limit), `validate` (zod schemas for owner/repo/ref/path), `github` (client,
error mapping, mappers), `db` (optional Neon), `http` (`handle()` wrapper + JSON errors), `ai/` (provider adapters, SSRF
guard, encrypted provider store, `resolveProvider()` for the agent).

Rules: validate every input, return `{ error: { code, message } }` on failure, never log tokens or
keys, never execute repository code on the server.

Preview (Phase 5) needs no functions — it builds and runs entirely in the browser sandbox.

Planned: Phase 6 `github-branch`, `github-commit`, `github-pull-request`.
