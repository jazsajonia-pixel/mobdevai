# Vercel API Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Chrono deployable to Vercel while preserving the existing `/api/*` contracts and Netlify deployment.

**Architecture:** Add one Vercel catch-all Node function at `api/[[...path]].ts`. It translates Vercel’s Node request/response objects into the existing Web `Request`/`Response` interface, resolves the route to the existing Netlify handler, forwards cookies and headers, and keeps all business logic shared. Add Vercel configuration for the Vite static output, SPA fallback, Node 22, and API runtime.

**Tech Stack:** Vite, React, TypeScript, Vercel Node Functions, existing Netlify handler modules, Neon Postgres.

## Global Constraints

- Do not remove or rewrite the existing `netlify/functions` implementation.
- Keep all `/api/*` paths and JSON/error/cookie contracts unchanged.
- Never expose secrets or commit environment values.
- Preserve OAuth callback behavior using `APP_URL`/request origin.
- Preserve request body size, method, and same-origin checks already enforced by the shared handlers.

## Review Focus

- Dynamic GitHub route parameters must map correctly, including branch names containing slashes in query parameters.
- Multiple `Set-Cookie` headers must survive the adapter.
- Empty bodies and 204 responses must not become the string `"undefined"`.
- Vercel requests with parsed JSON bodies and raw text bodies must both reach handlers correctly.
- Unknown API paths must return the existing JSON error shape instead of an SPA page.

---

### Task 1: Vercel compatibility adapter

**Files:**
- Create: `api/_lib/adapter.ts`
- Create: `api/[[...path]].ts`
- Create: `vercel.json`
- Modify: `package.json` scripts if needed

- [ ] Define minimal Vercel request/response interfaces to avoid adding a runtime dependency.
- [ ] Convert incoming headers, URL, body, and method into a Web `Request`.
- [ ] Resolve all current health, auth, AI, client-error, and GitHub routes to their existing Netlify handler modules with route params.
- [ ] Copy response status, headers, multiple cookies, text/JSON bodies, and empty responses back to Vercel.
- [ ] Add Vercel config for `npm run build`, `dist`, Node 22 API runtime, `/api/*` function routing, and SPA fallback only for non-API paths.

### Task 2: Vercel validation

**Files:**
- Create: `api/_lib/adapter.test.ts` if the project test config includes API files, otherwise add a focused Node test.
- Modify: `docs/DEPLOY.md`, `.env.example`

- [ ] Test route resolution for static and dynamic paths.
- [ ] Test body forwarding, cookie forwarding, 204 handling, and unknown routes.
- [ ] Run `npm run typecheck`, `npm test -- --reporter=dot`, and `npm run build`.
- [ ] Document required Vercel variables and OAuth callback URL.
- [ ] Produce a deployment-ready commit; deploy only after a Vercel connector/account is available.
