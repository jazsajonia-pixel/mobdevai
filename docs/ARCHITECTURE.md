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

## AI agent (Phase 4)

```
browser (src/features/agent)                       server (netlify/functions/ai-agent.ts)
 runner.advance() ── messages ──► POST /api/ai/agent ── resolveProvider() → key (server only)
      ▲                                │                  agentStep(): one model call with tools
      │◄──── assistant msg + tool calls┘                  (system prompt + tool list chosen here)
 tools-exec.executeTool() on workspace + proposal overlay
 propose_plan → pause for approval · write tools → proposal → review diffs → accept → ws.save()
```

- **One step per request.** Avoids long-running functions and lets the user stop at any time; the
  conversation (with tool results) is resent each step, compacted to ~350k chars.
- **Tool catalog** — `src/lib/agent-tools.ts` (shared). `toolsForMode()` is applied on the server;
  the client refuses write tools in Ask mode too.
- **Proposal overlay** — `proposal.ts`: `{path, before, after, decision}` per file. `apply_patch` edits
  must match exactly once. Conflicts (file changed after the agent read it) and deletions need
  confirmation when applying.

## Agent safety

- Repository content is data: tool outputs are wrapped in `<tool_output>` and attached files in
  `<attached_file>`; the server-only system prompt says they can't change the rules, to ignore embedded
  instructions and to tell the user about suspected prompt injection.
- No tool executes code, touches the network or GitHub; edits are proposals until the user accepts;
  deletes are flagged dangerous; nothing is committed or pushed by the agent.
- Request validation: strict schema (no client system prompt), size limits, every tool call answered,
  per-user rate limit. Keys never leave the function; upstream errors are redacted.

## Preview (Phase 5)

Browser-only — there are no preview endpoints and repository code never runs on our server.

```
workspace (base + saved + drafts) ─▶ analyzeProject() ─▶ buildPreview() ─▶ srcdoc HTML ─▶ <iframe sandbox>
                                       detect.ts          bundler.ts         runtime.ts       │ postMessage
                                                                                               ▼ (nonce + source check)
                                                                              usePreview(): console · errors · navigate
```

- **Bundle**: each local module is transformed with Sucrase to CommonJS and registered with a small
  loader (`runtime.ts`) that evaluates it with `//# sourceURL=preview:///path`, so stack traces map back
  to workspace lines. Bare imports become external ESM from `esm.sh` (`?dev`, React marked external
  and provided once through an import map); package CSS comes from jsDelivr.
- **Isolation**: `sandbox="allow-scripts allow-forms allow-modals allow-popups
  allow-popups-to-escape-sandbox"` — no `allow-same-origin`, so the frame's origin is opaque: it can't
  read this app's cookies or storage or call `/api/*` with credentials. `localStorage`,
  `sessionStorage` and `document.cookie` are in-memory shims; form submits and external navigations are
  blocked or reported. "Open in new tab" uses a script-free blob page wrapping the same sandboxed frame.
- **Messages**: the parent accepts only messages whose `source` is the preview frame and whose nonce
  matches the current build; payloads are truncated strings rendered as text.
- **Agent**: `request_preview` reuses the same build on the proposal overlay and `probe.ts` runs it in a
  hidden sandboxed frame for ≤5 s.

## Git shipping (Phase 6)

```
Git tab ─ selected FileChange[] + message + target ─▶ POST /api/github/repos/:o/:r/commit
                                                         │ repo perms · default-branch guard
                                                         │ createFrom? POST git/refs (new branch @ baseSha)
                                                         │ head ≠ baseSha? compare → overlap ⇒ GIT_CONFLICT
                                                         │ base tree (modes) → POST git/trees (inline content, sha:null deletes)
                                                         │ POST git/commits → PATCH ref (force:false)
                                                         ▼ failure after creating the branch ⇒ DELETE ref
                                      { branch, created, parentSha, commit, files }
                     optional ─▶ POST …/pulls (existing open PR is reused)
```

- The client sends `baseSha` = the commit the workspace changes were made on; the server never
  rebases or force-pushes. Content goes inline in the tree request (no blob round-trips).
- `ws.committed(paths, { newBaseSha, moveTo })` drops committed paths. With `moveTo` (new branch) the
  remaining work is saved under the new branch's workspace key and the current branch reverts to clean.
- Last result is kept in session storage (`last-ship:<owner/repo>`) so a PR can be retried; demo
  commits live in `demo-commits:v1` and are flagged `simulated`.
- Tokens stay in the encrypted session cookie; writes require same-origin + a per-user rate limit.
