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

## Polish (Phase 7)

- **History** (`src/features/history`): built on the per-workspace task store; `toHistoryEntry()`
  derives prompt/result/files/status, `filterHistory()` powers search and filters. Shipping info
  written from the Git tab survives later saves from an open AI tab (`saveTasks` merges `shipped`).
- **Dashboard** (`src/features/dashboard`): a workspace view (`overview`, not in the bottom bar)
  rendered inside the `WorkspaceProvider`, reusing `GitStatus` (compact), `ActiveProviderLink` and the
  last preview outcome (`preview-status:<workspaceKey>`, written by `usePreview`).
- **Patch export** (`src/features/git/patch.ts`): `diff`'s `createTwoFilesPatch` with Git headers.
- **CSRF** is enforced in `netlify/lib/http.ts#handle()` for every non-GET request.

## Production (Phase 8)

- `netlify/lib/http.ts › handle()` is the single entry point for every function: method check →
  same-origin check for writes → handler → error mapping. It assigns the request id (Netlify's
  `x-nf-request-id` when present), sets `X-Request-Id`, and writes one structured log line.
- `netlify/lib/log.ts` — JSON logger + redactor (`LOG_LEVEL`; silent under tests unless set).
- `netlify/lib/security.ts › rateLimit()` — async; `postgresStore` (shared) or `memoryStore`.
- `netlify/lib/env.ts › readiness()` — production configuration checks used by `/api/health` and
  `scripts/verify-env.ts`.
- `src/lib/monitoring.ts` — client crash reporting to `/api/client-errors`; `APP_VERSION` is injected
  from `package.json` at build time.
- `e2e/` + `playwright.config.ts` — starts mock GitHub, mock AI, the functions runner and Vite on
  dedicated ports (5273/8887/8890/8891) and drives mobile device profiles.

## Gemini key pool

Server-managed Gemini (`platform:gemini`) runs every real Gemini call through
`netlify/lib/ai/gemini-pool.ts › withGeminiFailover()`: agent steps (`/api/ai/agent`), the
provider test (`/api/ai/test-provider`) and model discovery (`models.list`).

- **Keys**: `GEMINI_API_KEYS` (JSON array, or newline / comma / semicolon / whitespace list) plus
  the legacy `GEMINI_API_KEY`, merged and deduplicated; blank and malformed entries are dropped.
  Keys stay in function memory only. Logs and metadata refer to slots by position (`gemini-2`).
- **Failover**: a request starts on one key (lowest index, or the least-busy key during concurrent
  bursts) and moves on only after an error another key could fix: 429 / `RESOURCE_EXHAUSTED`,
  quota-flavoured 403 (decided from Google's `status`/`reason`, not every 403), invalid/disabled
  key, 408/500/502/503/504 and timeouts. Each key is tried at most once per request, at most 8
  attempts, inside a 100 s budget (the Vercel function allows 120 s; the client waits 115 s).
- **No failover** for bad requests, unknown models, oversized input (413), safety blocks, or a
  client disconnect (the Vercel adapter forwards `close` as an abort signal).
- **Cooldowns**: per key **and model** (Google quotas are per project per model), from
  `google.rpc.RetryInfo.retryDelay` or `Retry-After`, default 15 s, daily quotas 10 min, capped at
  10 min; invalid keys 15 min. Cooldowns are never awaited — they only reorder/skip keys. They are
  per instance, so a cold instance may re-try a limited key once and immediately move on;
  correctness never depends on shared state.
- **All keys exhausted** → `429 AI_QUOTA_EXCEEDED` with the earliest `Retry-After` and counts only
  ("Tried 3 of 3 … 2 rate-limited, 1 unavailable"). All keys rejected → `503 AI_INVALID_KEY`.
  The client agent loop (`runner.ts › stepWithRetry`) waits that `Retry-After` (≤ 30 s, 2 times)
  and re-sends the identical step; tasks are only updated after a successful step.
- **Models**: `gemini-availability.ts` caches `models.list` for 10 minutes (1 minute after a failed
  lookup). The user's selected model is kept when listed; otherwise the request uses
  `gemini-flash-latest` (or the first listed Flash model if the alias itself disappears) and the
  response carries `provider.fallbackFrom`. A `404`/model-not-found from `generateContent`
  invalidates the cache and retries once on the fallback model with the same messages.
- **Health**: `/api/health` reports key counts; `/api/health?gemini=1` (3/min per IP) lists models
  per key with the free `models.list` endpoint and returns counts only.
- **Limitation**: keys from the same Google Cloud project share one quota, so only keys from
  different projects/accounts add capacity.
