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

## Phase 3 — AI providers (next)

Server-side encrypted storage for OpenAI, Anthropic, Gemini and OpenAI-compatible keys, masked
hints, test connection, default provider/model selection.

## Later phases

2 Mobile editor · 3 AI providers · 4 AI coding agent · 5 Live preview · 6 Git shipping · 7 Polish · 8 Production
