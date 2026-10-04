# Deploying Mobile Development AI (Netlify)

This guide takes the repository to a production site on Netlify. It takes about 15 minutes. Nothing
here requires putting a secret in the repository or in a `VITE_*` variable.

## 1. Create the Netlify site

1. Netlify → **Add new site → Import an existing project → GitHub** → pick this repository.
2. Leave the build settings alone — `netlify.toml` defines them:
   - build command `npm run build`, publish directory `dist`, functions `netlify/functions`
   - Node 22, esbuild function bundler, security headers, immutable caching for `/assets/*`
3. Deploy once. The site works in **demo mode** until the variables below are set — that's expected.
   Note the site URL (e.g. `https://mobdevai.netlify.app`, or your custom domain).

## 2. Create the GitHub OAuth App

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

| Field | Value |
| --- | --- |
| Homepage URL | `https://<your-site>` |
| Authorization callback URL | `https://<your-site>/api/auth/github/callback` |

Copy the **Client ID** and generate a **Client secret**. Deploy previews have different URLs, so
GitHub sign-in only works on the production URL (or a second OAuth App for previews).

## 3. Database (recommended)

A PostgreSQL database (Neon's free tier works) enables saved AI providers across devices and
**shared rate limits** across all function instances.

```bash
DATABASE_URL='postgres://…?sslmode=require' npm run db:migrate   # idempotent; re-run after upgrades
```

Migrations live in `db/migrations/` (`003_rate_limits.sql` was added in Phase 8).

## 4. Production environment variables

Netlify → **Site configuration → Environment variables**. Mark the secrets as *secret* and scope
them to **Functions** (they're never needed at build time).

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | yes | `https://<your-site>` — must be https in production |
| `GITHUB_CLIENT_ID` | yes | from step 2 |
| `GITHUB_CLIENT_SECRET` | yes | from step 2 — secret |
| `SESSION_SECRET` | yes | `openssl rand -base64 32` — secret |
| `ENCRYPTION_KEY` | recommended | `openssl rand -base64 32`, different from `SESSION_SECRET` — needed to save AI provider keys |
| `DATABASE_URL` | recommended | shared rate limits + saved providers |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | optional | platform keys billed to you, offered to every signed-in user |
| `LOG_LEVEL` | optional | `info` (default), `warn`, `error`, `debug`, `silent` |

Never set in production: `AI_ALLOW_PRIVATE_BASE_URLS` (it's ignored there anyway), `RATE_LIMIT_STORE=memory`,
`GITHUB_API_URL` / `GITHUB_WEB_URL` (only for GitHub Enterprise), or any `VITE_*` variable holding a secret.

Check the configuration before deploying — prints names and pass/fail only, never values:

```bash
npm run verify:env            # production rules, reads .env + current environment
```

Then **Deploys → Trigger deploy → Clear cache and deploy site**.

## 5. Verify the deployment

```bash
npm run verify:env -- --url https://<your-site>
```

This calls `GET /api/health`, which returns `version`, `commit`, `context` and `ready`, plus the ids of
any failing checks (`session-secret`, `app-url`, …), never values. `ready: false` means a
production-blocking check failed.

Then on a phone:

1. Open the site → **Sign in with GitHub** → authorize → your repositories are listed.
2. Open a repository, edit a file, **Save**, go to **Git** → commit to a **new branch** with
   *Open a pull request* on → the PR link opens on GitHub.
3. Settings → **AI providers** → add your key → **Test connection** → run an Agent task.
4. Open **Preview** for a static or Vite project.

## Monitoring & logs

- **Function logs** (Netlify → Logs → Functions): one JSON line per request with `requestId`, `method`,
  `path` (no query string), `status`, `ms` and the error `code`. Unhandled errors are logged as
  `"msg":"unhandled"`. All fields go through a redactor that masks tokens, keys, cookies and
  secret-named fields.
- **Request ids**: every API response carries `X-Request-Id` (Netlify's own id when present). Error
  screens show it as `ref …` so users can quote it; search the logs for that id.
- **Client crashes**: the error boundary and global error handlers POST a small report
  (message, trimmed stack, route with repo names masked, app version) to `/api/client-errors`,
  logged as `"msg":"client error"`. Capped at 5 reports per page load, rate-limited per client.
- **Uptime**: point any uptime monitor at `https://<your-site>/api/health` (expects HTTP 200 and `"ready":true`).
- **Log drains** (Netlify paid plans) can forward these JSON lines to Datadog, Logtail, etc. as-is.

## Rate limits

| Endpoint | Limit (per user or client, per minute) |
| --- | --- |
| AI agent | 40 |
| AI provider list / changes | 120 / 30 |
| Provider connection test | 10 |
| Commit · branch | 20 · 20 |
| Pull request | 10 |
| OAuth start · callback | 10 · 20 (per IP) |
| Client error reports | 30 (per IP) |

With `DATABASE_URL` the counters are shared across all function instances (one atomic upsert per
hit; keys are stored hashed). Without it, or if the database is unreachable, each instance counts on
its own. Exceeding a limit returns `429` with `Retry-After`.

## Continuous integration

`.github/workflows/ci.yml` runs on every PR and push to `main`:

1. `npm run check` — typecheck, unit/integration tests, production build
2. `npm audit --omit=dev --audit-level=high`
3. `npm run e2e` — Playwright on **Pixel 7 (Chrome)**, **iPhone 14 viewport (Chromium)** and
   **iPhone 14 (WebKit/Safari)**, against the real app + functions with mock GitHub and a mock AI
   provider. No secrets needed. A failure uploads the HTML report with traces and screenshots.

Locally: `npm run e2e:install` once, then `npm run e2e` (`E2E_SKIP_WEBKIT=1` where WebKit can't be installed).

## Real-device checklist

Automated runs emulate phones. Before announcing a release, check on real hardware:

| Check | iPhone Safari | Android Chrome |
| --- | --- | --- |
| Sign in with GitHub (OAuth round trip, returns to the app) | ☐ | ☐ |
| Editor: typing, selection handles, symbol bar, tab bar hides with the keyboard and returns | ☐ | ☐ |
| Save → Git → commit to new branch → PR opens | ☐ | ☐ |
| Agent run with a real provider; review diffs; accept | ☐ | ☐ |
| Preview renders; console sheet opens; rotate the phone | ☐ | ☐ |
| Airplane mode: commit blocked with explanation; drafts survive a reload | ☐ | ☐ |
| Add to Home Screen; safe areas around the notch / home indicator | ☐ | ☐ |

## Rollback

Netlify → **Deploys** → pick the previous deploy → **Publish deploy**. Database migrations are
additive (`CREATE … IF NOT EXISTS`), so rolling back the app never needs a database rollback.
