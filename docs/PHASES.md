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

## Phase 1 — Auth + GitHub ✅

Implemented:

- **GitHub OAuth** (OAuth App): `start` → GitHub → `callback`. One-time `state` sealed in an HTTP-only
  cookie and compared in constant time (login-CSRF safe). Code exchanged server-side.
- **Least-privilege scopes**: `read:user public_repo` by default; `repo` only when the user ticks
  "Include private repositories".
- **Sessions**: AES-256-GCM sealed, HTTP-only, `SameSite=Lax`, `Secure` (on https) cookie, 7-day expiry.
  The token never reaches browser JavaScript. Tampered/expired cookies are cleared.
- **Logout** revokes the GitHub token (best effort) and clears the cookie, behind a confirmation sheet.
- **CSRF**: state-changing endpoints require a same-origin `Origin`/`Sec-Fetch-Site`. Auth endpoints are rate limited.
- **Repositories**: list (paginated, searchable, visibility / default branch / language / updated / fork /
  archived / read-only badges), repository metadata and permissions.
- **Branches**: bottom-sheet picker with search, default and protected markers; remembered per repo.
- **File tree**: recursive tree for any branch (including `feature/x` names), large-repo truncation notice,
  "Go to file" filter.
- **Read-only file viewer** for GitHub files with binary / >1 MB / not-found handling and "View on GitHub".
- **Errors** mapped for: expired/revoked session (auto sign-out + message), missing permissions, private
  repo without access, SAML/org restrictions, rate limits (with reset time), empty repos, GitHub outages,
  invalid input, cancelled authorization, failed code exchange.
- **Optional Neon** persistence of `users` + `github_connections` (no tokens). `npm run db:migrate`.
- **Local dev without the Netlify CLI**: `npm run dev:api` runs the functions; `npm run dev:mock-github`
  runs a fake GitHub for end-to-end testing with no credentials.
- 58 tests (35 server, 23 client), including secret-leak checks on every auth response.

Known limitations: rate limiting is per function instance; GitHub App installs (fine-grained repo access)
are not supported yet — OAuth App only.

## Phase 2 — Mobile editor ✅

Implemented:

- **CodeMirror 6 editor** (chosen over Monaco for mobile keyboards, selection handles and IME) with
  syntax highlighting for JS/JSX/TS/TSX, HTML, CSS, JSON, Markdown, Python, YAML, shell and TOML.
  Languages load on demand; the whole workspace route is code-split from the landing page.
- **Open-file tabs** with unsaved dots, per-file undo history kept across tab switches, and a
  "Save and close / Close, keep draft / Discard" sheet for dirty tabs. Up to 8 tabs (oldest clean one closes).
- **Thumb-reachable action bar**: Undo · Redo · Find · Save · More. `Ctrl/⌘-S` and `Ctrl/⌘-F` also work.
- **Symbol bar** above the keyboard (`⇥ { } ( ) [ ] < > = ; : " ' \` / | & $`) while typing; the
  workspace tab bar hides to make room (`interactive-widget=resizes-content`).
- **Find / replace** in file: match case, whole word, regex, match counter, replace / replace all.
- **Search across files** (plain or regex) including unsaved edits; "Load N files" fetches the rest
  of the repo's text files (capped at 300, ≤ 256 KB each, skips binaries/build output).
- **File tree drawer** with change markers (A / M / ● unsaved; folders show a dot if they contain changes).
- **Create, rename/move and delete** files with path validation (no `..`, `.git/`, control characters, clashes).
- **Workspace model**: base snapshot (pinned to the branch's commit) + saved changes + unsaved drafts.
  Saving writes to the local workspace only — nothing is sent to GitHub until a commit (Phase 6).
- **Local draft protection**: workspaces are stored per repo + branch in `localStorage`, flushed on
  every change (debounced), on tab hide and on unmount. Survives reloads and crashes. Tabs editing
  the same branch stay in sync. A banner warns if storage is full, and if the branch moved on GitHub.
- **Diff viewer** in the Git tab: per-file unified diff with line numbers and +/− counts,
  side-by-side on wide screens, discard per file or all (with confirmation), jump to the file.
- 91 tests (35 server, 56 client) including editor flows: edit → save → diff → discard, undo/redo,
  find/replace, create/rename/delete, reload persistence, project search.

Known limitations: drafts live in `localStorage` (~5 MB per site); very large diffs (> 400 KB) show
counts only; HTML tag auto-close is CodeMirror's default behaviour.

## Phase 3 — AI providers ✅

Implemented:

- **Settings → AI providers** (`#/app/settings/ai`): add OpenAI, Anthropic, Google Gemini or any
  OpenAI-compatible endpoint (base URL). Per provider: API key, model (suggestions + the models your key
  can list), optional name, enable/disable, default provider. Edit (keep or replace the key) and remove
  with confirmation.
- **Test connection** before or after saving (`POST /api/ai/test-provider`): lists models to validate the
  key, then a ~16-token generation to validate the model. Shows latency, model count, and clear errors
  (invalid key, unknown model, quota/rate limit, provider down, blocked base URL). Last result is saved.
- **Provider abstraction** in `netlify/lib/ai` (`chat` + `listModels` per provider) ready for the agent.
- **Key security**: keys are sent once to our server functions and never returned (masked hint only),
  encrypted with AES-256-GCM and bound to user + provider. Storage is explicit in the UI:
  encrypted in Postgres when `ENCRYPTION_KEY` + `DATABASE_URL` are set, otherwise **session-only** in an
  encrypted HTTP-only cookie that's deleted on sign-out. Browser never calls a provider directly.
- **SSRF protection** for custom base URLs; redirects refused so keys can't be bounced elsewhere.
- **Server-provided keys** (`OPENAI_API_KEY`, …) show as read-only providers.
- The AI page, workspace AI tab and Settings show the current default provider/model.
- Demo mode explains that AI keys need GitHub sign-in (no provider calls in demo).

Known limitations: session-only storage holds up to 6 providers (cookie size); DNS-rebinding protection
is best effort (resolved before the call, not pinned); the database backend is covered by type checks and
shared state tests but not exercised against a live Neon instance in CI.

## Phase 4 — AI coding agent ✅

Implemented (workspace **AI** tab, `src/features/agent`, `POST /api/ai/agent`):

- **Two modes.** **Ask** is read-only chat about the repository (tools: `list_files`, `read_file`,
  `search_code`, `get_git_status`, `inspect_package_json`). **Agent** adds `propose_plan` and the edit
  tools `create_file`, `update_file`, `apply_patch` (exact find/replace edits), `rename_file`,
  `delete_file`. The server decides which tools each mode gets; calls to anything else are refused.
- **Loop design.** The browser runs the loop: each `POST /api/ai/agent` makes exactly one model call
  with native tool calling (OpenAI / compatible `tool_calls`, Anthropic `tool_use`, Gemini
  `functionCall` with thought signatures echoed back), so every request stays well under Netlify's
  60 s function limit. Tools run in the browser against the local workspace (drafts → saved → GitHub
  base), so the agent sees your unsaved edits and needs no GitHub token of its own.
- **Plan first.** In Agent mode the model must call `propose_plan` before editing; the run pauses on a
  plan card with **Approve** / **Change plan** (typing a message while a plan waits also counts as feedback).
- **Proposals, not writes.** Edit tools only stage changes in a per-task proposal; later reads see the
  proposed content. The proposal card lists files with +/− counts; **Review** opens per-file diffs
  (reusing the Git diff viewer) with Accept / Reject per file or all. Accepted files become ordinary
  saved workspace changes (visible in the Git tab, revertible there). Deletions and files you edited after
  the agent read them need an extra confirmation. Nothing is committed or pushed.
- **Every tool call is logged** in the task timeline (expand to see arguments and output; errors in red).
- **Composer:** attach the open file (toggle), `@path` mentions with autocomplete, quick actions
  (Explain this · Fix this · Find bugs · Implement… · Review changes), Stop, and Continue after a stop,
  error or the 24-step limit. Replies render as Markdown (raw HTML disabled, safe links only).
- **Tasks** are saved per repo + branch on this device (last 15; long tool outputs trimmed) with a
  history sheet; the AI page lists recent tasks across projects.
- **Safety:** server-only system prompt; tool output and attached files are fenced as untrusted data
  and the model is told to report suspected prompt injection; request size/shape validation (every tool
  call must have a result); 40 steps/min per user; provider keys resolved server-side and redacted from
  errors.
- **Demo mode:** a clearly labelled **Simulated AI** runs scripted requests on the sample project (add a
  delete button, clear completed, dark mode, explain) through the same real loop — tool calls, plan,
  diffs, review, apply — without any model. It never claims anything reached GitHub.
- `scripts/mock-ai.ts` now scripts a tool-calling agent for local end-to-end QA.
- 137 tests (incl. per-provider tool mapping, mode filtering, plan pause/resume, stop/error, patch
  failures, demo flow plan → approve → review → accept → Git tab).

Known limitations: steps aren't streamed (each step shows a spinner, then the result); "chat" is Ask
mode on the same endpoint rather than a separate `/api/ai/chat`; tasks live in `localStorage`; the agent
can't run commands or tests yet (Phase 5 adds preview; there is no server-side code execution).

## Phase 5 — Live preview (next)

Sandboxed in-browser preview for static HTML/CSS/JS and Vite + React projects, with console output.

## Later phases

5 Live preview · 6 Git shipping · 7 Polish · 8 Production
