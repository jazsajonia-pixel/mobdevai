# Security review (Phases 7–8)

Checked against the product's security requirements. Automated checks live in
`netlify/tests/security.test.ts` (invariants) and run with `npm run check`.

| Requirement | Implementation | Verified by |
| --- | --- | --- |
| OAuth, no GitHub passwords | GitHub OAuth web flow with `state`; tokens only in an AES-GCM encrypted, `HttpOnly`, `Secure`, `SameSite=Lax` cookie | `netlify/tests/functions.test.ts` (OAuth round trip), `lib.test.ts` (seal/unseal) |
| Minimal GitHub scopes | `read:user public_repo`; `repo` only when the user opts into private repos | `netlify/lib/github.ts` scope builder, `functions.test.ts` |
| Server-side secrets | OAuth secret, session/encryption keys and AI keys only in Netlify Functions. No `VITE_*` secrets | `security.test.ts` (VITE_ scan, `.env.example` placeholders, `.gitignore`) |
| AI keys never exposed | Stored encrypted (Postgres or session cookie), masked in responses, never returned | `netlify/tests/ai.test.ts`, `src/ai-providers.test.tsx` |
| Input validation | zod schemas for every body/param (owner/repo/ref/path, commit ≤ 300 files / 5 MB, no `.git/` paths) | `functions.test.ts`, `git.test.ts`, `ai*.test.ts` |
| Rate limiting | Per-user / per-IP fixed window (agent 40/min, commits 20/min, provider tests 10/min, crash reports 30/min). Shared across instances via Postgres when `DATABASE_URL` is set (hashed keys); memory fallback | `lib.test.ts` (rateLimit), e2e `production.spec.ts` |
| CSRF / session protection | `handle()` rejects any non-GET request whose `Origin` (or `Sec-Fetch-Site`) is cross-site; SameSite cookies; expired sessions clear the cookie | `security.test.ts` (CSRF) |
| No arbitrary server-side execution | No `child_process`, `eval`, `new Function` or `vm` in server code; repository code never runs on the server | `security.test.ts` |
| Sandboxed preview | `srcdoc` iframe without `allow-same-origin` (opaque origin), nonce-checked `postMessage`, storage/cookie shims, blocked form posts and navigations | `src/features/preview/preview.test.ts` |
| Restricted AI tools | Read/search/propose only; edits are proposals until accepted; deletes flagged; the agent cannot commit, push or run code; SSRF guard for custom base URLs | `netlify/tests/ai-agent.test.ts`, `src/features/agent/agent.test.ts` |
| Prompt injection | Repository content is wrapped as data (`<attached_file>`), system prompt states files are not instructions; the agent reports suspected injection | `ai-agent.test.ts` |
| Confirm destructive actions | Discard, delete file/task, commit to the default branch and sign-out use confirmation sheets; never force-push | `src/*-flow.test.tsx` |
| Sanitized rendering | Markdown is rendered to React elements (no raw HTML); no `dangerouslySetInnerHTML` anywhere | `security.test.ts` |
| No secrets in logs | Structured logs carry route, status, duration and error codes only; a redactor masks token-shaped values and secret-named fields | `security.test.ts` (console scan), `monitoring.test.ts` |
| Production config | `readiness()` blocks missing/short secrets, non-https `APP_URL`, secret `VITE_*` vars and `AI_ALLOW_PRIVATE_BASE_URLS` (also ignored in production) | `env.test.ts`, `npm run verify:env` |
| Crash reports | Same-origin only, strict schema, 6 KB cap, rate-limited; no file contents, prompts or repo names | `monitoring.test.ts` |
| `.env` never committed | `.gitignore` covers `.env` and `.env.*`; `.env.example` has placeholders only | `security.test.ts` |
| HTTP hardening | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP, CSP (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://github.com`) | `security.test.ts` (headers) |
| Dependencies | `npm audit --omit=dev` → 0 vulnerabilities (Oct 2026) | manual |

## Known limitations

- **CSP script sources are open.** The preview `srcdoc` frame inherits the app's CSP and needs
  esm.sh / jsDelivr plus runtime evaluation. Moving the preview to a separate origin would allow a
  strict `script-src` for the app itself.
- **Without `DATABASE_URL`, rate limits are per function instance.** Set it in production.
- **Local data is not encrypted at rest.** Workspace drafts and task history live in `localStorage` on
  the user's device (never keys or tokens). Signing out clears session data; drafts stay until discarded.
- **Real-device checks are manual.** CI emulates phones (Chromium + WebKit); see the checklist in DEPLOY.md.
