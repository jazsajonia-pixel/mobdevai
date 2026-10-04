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
