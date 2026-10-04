# Architecture

```
Phone browser ──► React SPA (Netlify CDN)
                    │  fetch /api/* (same-origin, HTTP-only session cookie from Phase 1)
                    ▼
               Netlify Functions ──► GitHub REST / Git Data API
                    │            └──► AI providers (OpenAI · Anthropic · Gemini · compatible)
                    ▼
               PostgreSQL (Neon) — users, projects, task history, encrypted provider keys
```

## Client

- **Routing** — hash-based (`/#/app/...`) so deep links survive any static host and embedded previews.
- **Session** — `src/stores/session.tsx`. Modes: `anonymous`, `demo`, `github`. Protected routes use
  `RequireSession`. The GitHub token is never held client-side.
- **Errors** — `src/lib/errors.ts` defines one vocabulary of codes shared with functions; `ErrorState`
  renders title + next step + code. `src/lib/api.ts` maps network failures, timeouts, HTML fallbacks
  and HTTP statuses onto those codes.
- **Storage** — `safeStorage` never throws (falls back to memory). Holds UI prefs, demo flags and
  workspaces (file contents you edited — never tokens or keys).
- **Workspace** (`src/features/workspace`) — pure model (`model.ts`) of *base* (files at the branch's
  commit) + *changes* (saved: added / modified / deleted, with base content for diffs) + *drafts*
  (unsaved buffers) + open tabs. `WorkspaceProvider` loads base files lazily, persists per
  `ws:<source>:<owner>/<repo>@<branch>`, and is remounted per branch + commit. Renames are delete + add.
  Phase 4 (agent diffs) and Phase 6 (commit) read `changes` from here.
- **Editor** (`src/features/editor`) — one CodeMirror `EditorView`; an `EditorStateCache` keeps each
  file's state (undo history) with epochs so reverted/renamed files can't be written back stale.
- **Shells** — `AppShell` (Home / Projects / AI / Preview / Settings; bottom bar on phones, rail on desktop)
  and `WorkspaceShell` (Files / AI / Preview / Git inside a repository).

## Server

- Functions use the v2 signature `(req: Request) => Response` with `export const config = { path }`.
- `netlify/lib/env.ts` decides what's configured (placeholders from `.env.example` count as unset).
- All errors: `{ error: { code, message } }`, `Cache-Control: no-store`.

## AI providers (Phase 3)

- **Abstraction** — `netlify/lib/ai/adapters.ts`: one `ProviderAdapter` (`chat`, `listModels`) per
  provider: OpenAI (Chat Completions), Anthropic (Messages), Gemini (`generateContent`), and any
  OpenAI-compatible base URL. Timeouts, `redirect: "manual"`, and upstream errors mapped to
  `AI_INVALID_KEY`, `AI_MODEL_NOT_FOUND`, `AI_QUOTA_EXCEEDED`, `AI_PROVIDER_UNAVAILABLE` with key-like
  strings redacted. `resolveProvider()` (`resolve.ts`) gives Phase 4 a decrypted key server-side only.
- **Storage** — `store.ts` picks a backend and says so in the UI:
  - `database` (ENCRYPTION_KEY + DATABASE_URL): `ai_providers` rows hold AES-256-GCM ciphertext.
  - `session` (SESSION_SECRET only): the same encrypted records inside a sealed HTTP-only cookie
    `mdai_ai` (`Path=/api/ai`, `SameSite=Strict`), cleared on sign-out, expiring with the session.
  Every key is field-encrypted with AAD `user:<githubId>|provider:<id>`, so ciphertext can't be
  replayed for another user or record. Responses only ever carry a masked hint (`sk-…WXYZ`).
- **Custom base URLs** — https only, no credentials/query, no localhost/private/link-local IPs
  (checked again after DNS resolution). `AI_ALLOW_PRIVATE_BASE_URLS=true` is for local dev only.
- **Platform keys** — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` appear as read-only
  "server" providers for every signed-in user.

## Data model (Phase 1+)

`User`, `GitHubConnection`, `AIProvider` (encrypted key + masked hint), `Project`, `Workspace`,
`WorkspaceFile`, `AITask`, `AITaskMessage`, `GitOperation`, `PreviewSession`. Persist only what's needed.

## Agent safety (Phase 4)

The agent gets explicit, logged tools (`list_files`, `read_file`, `search_code`, `apply_patch`, …).
Repository files are passed as quoted data with a system instruction that they cannot change the agent's
rules. Destructive tools (delete, force operations, writing to the default branch) require confirmation.

## Preview (Phase 5)

Sandboxed iframe (`sandbox="allow-scripts"`, separate origin) with an in-browser bundler for
HTML/CSS/JS and Vite + React. Projects that need a server runtime get an explicit "not supported" message.
`detectProjectKind()` in `src/lib/tree.ts` already classifies projects by reading `package.json` as data.
