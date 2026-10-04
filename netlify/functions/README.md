# Netlify Functions

Server-side code. This is the only place secrets (GitHub client secret, AI provider keys,
session/encryption keys) may be read. Each `.ts` file here is one function (tests live in `netlify/tests` so they are never deployed) with an explicit `config.path`.

| Function | Route | Phase | Status |
| --- | --- | --- | --- |
| `health.ts` | `GET /api/health` | 0 | Live — reports configured capabilities as booleans |
| `auth-github-start.ts` | `POST /api/auth/github/start` | 1 | Stub — returns `GITHUB_OAUTH_NOT_CONFIGURED` / `NOT_IMPLEMENTED` |
| `auth-session.ts` | `GET /api/auth/session` | 1 | Stub — always `{ authenticated: false }` |

Planned (see the master prompt's API design):

- Phase 1 — `auth-github-callback`, `auth-logout`, `github-repos`, `github-tree`, `github-file`
- Phase 3 — `ai-test-provider`, provider settings (encrypted at rest)
- Phase 4 — `ai-chat`, `ai-agent` (tool-based, repository content treated as untrusted data)
- Phase 5 — `preview-start`, `preview-stop`, `preview-status`
- Phase 6 — `github-branch`, `github-commit`, `github-pull-request`

Rules: validate every input (zod), return `{ error: { code, message } }` on failure,
never log tokens/keys, never execute repository code on the server.
