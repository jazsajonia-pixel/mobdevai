# Spec: Gemini Model Selection and Agent Continuity

## Objective

Chrono must provide a server-managed Gemini experience in which:

1. **Gemini remains the only server-managed default provider.** Groq and other server providers must not replace it.
2. Signed-in users can select an eligible Gemini text-generation model from Chrono settings.
3. The selected Gemini model is saved to the signed-in user account and synchronizes across devices.
4. `gemini-flash-latest` remains the default and fallback model.
5. Switching workspace tabs/pages does not cancel an active agent run. The user should return to the AI tab and see the live/current task state.
6. Gemini API keys are used normally without rotation. A different key is tried only after a retryable Gemini failure.
7. Failover must not add an artificial five-second delay between healthy keys.

The feature must never expose server API keys, delete existing database provider records, or claim that multiple keys remove Google project-level quotas.

## Assumptions

1. Chrono continues using React, TypeScript, Vite, Netlify-compatible server functions, and Vercel deployment.
2. Signed-in account identity is provided by the existing GitHub session.
3. The existing PostgreSQL/Neon `users` table is the account-level persistence boundary.
4. Server Gemini keys remain configured through environment variables and are not editable by users.
5. The current client-side agent loop remains responsible for executing workspace tools because the workspace is local/browser-backed.
6. “Switching pages” primarily means switching tabs within the same open workspace, such as Files, Preview, Git, and AI. Leaving the project entirely may detach the workspace runtime and must be handled explicitly rather than silently losing progress.
7. Free-tier eligibility is not inferred only from a model name. Google may change availability by project, account, or usage tier, so the server must validate models against the configured key pool when possible.

## Current official model policy

The curated server-managed model selector should start with these text-generation model IDs:

- `gemini-flash-latest` — default alias and fallback
- `gemini-3.8-flash`
- `gemini-3.7-flash`
- `gemini-3.6-flash`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.1-flash-lite`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

The selector must exclude image-generation, audio, TTS, Live, embedding, transcription, and unrelated preview models.

`gemini-2.5-pro` must not be presented as a free-tier model by default because current Google pricing documentation marks standard free-tier access as unavailable. It may be added later only as a separately labeled advanced/paid-availability option after explicit product approval.

The UI may show only models that are both in the curated safe catalog and reported as usable by at least one configured server key. If model-list probing is unavailable, the UI may show the curated list with an “availability depends on your server keys” explanation, while the server remains authoritative and returns a clear model-unavailable error.

## Technical design

### Account preference

Add an account-level Gemini preference associated with the existing `users` row:

- `ai_gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-latest'`

The value is a model ID, not an API key and not a provider ID. It must be validated against the server-approved catalog before saving. Invalid, removed, or unavailable values must automatically resolve to `gemini-flash-latest` without breaking sign-in or provider loading.

The preference must be read and written only on the server. It must synchronize across devices for the same signed-in account.

### API contract

Extend the authenticated AI settings API with a dedicated server-Gemini preference operation rather than allowing a generic provider patch to mutate server secrets.

Proposed endpoints:

- `GET /api/ai/providers`
  - Continue returning the read-only `platform:gemini` provider.
  - Its displayed `model` must be the effective account-selected model.
  - Include a safe model-options payload or a dedicated model-options endpoint.
  - Never include key values.

- `PATCH /api/ai/platform/gemini`
  - Request: `{ model: string }`
  - Requires the authenticated account and same-origin protection.
  - Validates the model against the approved catalog and configured-key availability policy.
  - Persists the account preference.
  - Returns the updated public provider data and available model options.

A dedicated endpoint is preferred because the server-managed provider is immutable except for its account-level model preference. User-owned provider mutations must retain their existing behavior.

### Provider resolution

`platformProviders()` should continue to identify Gemini as the server provider and use the first configured Gemini key only as the normal starting key. The account preference must be applied after account/session resolution, before agent execution.

The agent endpoint must stop forcing `gemini-flash-latest`. It must use the resolved account preference while retaining `gemini-flash-latest` as a safety fallback.

The response provider metadata should report the actual selected/effective model, not a hard-coded model.

### Model availability

Implement a server-safe availability helper that:

1. Normalizes model names by removing an optional `models/` prefix.
2. Restricts choices to text-generation models compatible with the agent’s `generateContent` request.
3. Uses the configured Gemini key pool for probing/listing when practical.
4. Caches availability briefly to avoid calling Google on every page load.
5. Does not persist API keys or return key-specific secrets.
6. Treats Google’s model list as advisory; a generation request remains authoritative.

If a selected model becomes unavailable, the server should return a typed `AI_MODEL_NOT_FOUND` or `AI_MODEL_UNAVAILABLE` error with a safe message and suggest returning to `gemini-flash-latest`. It must not silently switch models during a successful task unless the user explicitly chooses fallback behavior in a later product decision.

### Agent continuity across workspace pages

The current `useAgent()` cleanup aborts the controller when `AgentPanel` unmounts. Replace this page-local ownership with a workspace-scoped coordinator:

- The coordinator is mounted at the workspace/provider level, above the tab body.
- It owns the active task, abort controller, runner, persistence, and workspace tool view.
- `AgentPanel` becomes a subscriber/view that attaches to the coordinator when the AI tab is visible.
- Switching between Files, Preview, Git, and AI must not abort the coordinator.
- The coordinator continues executing model steps and local workspace tools while the user remains in the same workspace.
- Every state transition is persisted promptly to the existing task store.
- Re-entering the AI tab rehydrates the current task and displays its running, awaiting-plan, error, stopped, or done state.
- Explicit Stop still aborts the run and produces the existing Continue state.
- Existing plan approval, revision, step-limit, and tool-error boundaries remain intact.

If the user leaves the entire project/workspace route, the coordinator must not claim that it can safely execute workspace tools without the workspace. It should either remain attached to a persistent workspace runtime or transition to a recoverable paused state with the task saved. This boundary must be tested and documented rather than relying on React unmount behavior.

### Failover behavior and latency

Update Gemini failover semantics:

1. Keep the current key for every normal request.
2. Do not rotate keys after successful responses.
3. Rotate only for retryable errors:
   - HTTP 429 / `AI_QUOTA_EXCEEDED`
   - transient 502/503/504 provider failures
   - connection/time-out failures that are safe to retry
4. Try the next eligible key immediately; do not sleep for the provider’s Retry-After before trying a different key.
5. Preserve Retry-After only when all eligible keys are exhausted and the response must be returned to the client.
6. Do not retry non-retryable errors such as invalid model, malformed request, authentication failure, or safety/policy rejection.
7. Preserve the selected model and complete conversation/provider state across key failover.
8. Bound attempts to the number of configured keys and a safe maximum.
9. Record only non-secret operational metadata if diagnostics are needed; never log keys or full prompts.

Important product explanation: Google applies rate limits per project, not per key. Failover cannot guarantee higher quota when several keys share one project.

## User experience

### Server Gemini settings card

The read-only server Gemini card should display:

- `Google Gemini (server)`
- Current selected model
- A model selector containing eligible options
- A short note: “This preference syncs with your account across devices.”
- A short quota note: “Key failover happens only after retryable errors; Google quotas are project-based.”
- No edit/delete controls for server keys
- No Groq card

The current screenshot shows the missing behavior: the server Gemini card displays the model as plain text and offers only a Test action. The implementation must add an actual model-selection control to this card, such as a select menu or model-picker button. It must be available specifically for `Google Gemini (server)`, even though the server key itself remains immutable. Saving the selection must call the authenticated account-preference endpoint and refresh the card from the server response.

The default state must visibly show `gemini-flash-latest`.

When saving a model:

- Disable the selector while saving.
- Show success feedback after the server confirms persistence.
- Update the active-provider display and agent header immediately from the returned server response.
- Show a typed error if the model is unavailable.

### Agent page

While the agent is running and the user changes workspace tabs:

- No “Stopped” message should appear merely because the AI panel unmounted.
- Returning to AI should show the active task and its current progress.
- The Continue button should appear only for explicit stop, step limit, recoverable detach/pause, or an error that requires retry.
- The selected Gemini model should be visible in the provider header and final usage line.

## Commands

- Type check: `npm run typecheck`
- Targeted tests: `npx vitest run netlify/tests/ai.test.ts netlify/tests/ai-agent.test.ts src/lib/ai-catalog.test.ts src/features/agent/agent.test.ts src/ai-providers.test.tsx`
- Full tests: `npm run check`
- Production build: `npm run build`

## Project structure

- `src/lib/ai-catalog.ts` — curated Gemini model catalog
- `src/types/ai.ts` — public provider/model contracts
- `src/types/agent.ts` — agent wire/task contracts
- `src/features/ai/*` — server Gemini selector and provider UI
- `src/features/agent/*` — workspace-scoped agent coordinator, runner, task persistence, and panel
- `netlify/lib/ai/*` — model validation, provider resolution, Gemini failover, and adapters
- `netlify/functions/ai-providers.ts` — provider settings API
- `netlify/functions/ai-agent.ts` — agent step API
- `db/migrations/*` — account preference migration
- `netlify/tests/*` and `src/*test*` — regression coverage

## Code style

Use small typed helpers and preserve the existing immutable state style. Example:

```ts
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export function effectiveGeminiModel(value: string | null | undefined, available: readonly string[]): string {
  const model = value?.trim();
  return model && available.includes(model) ? model : DEFAULT_GEMINI_MODEL;
}
```

Never place key material in client types, local storage, logs, response bodies, or test snapshots.

## Testing strategy

### Model selection

- Default account with no preference resolves to `gemini-flash-latest`.
- Valid selected model persists and is returned on a later request.
- A second session for the same account sees the selected model.
- A different account does not see the first account’s selection.
- Invalid, removed, and non-agent models are rejected or safely reset.
- `gemini-2.5-pro` is not included in the free curated list.
- Server key values never appear in response bodies or rendered HTML.
- Agent requests use the selected model instead of a hard-coded default.

### Continuity

- Unmounting/remounting `AgentPanel` during a running task does not abort the run.
- Switching workspace tabs preserves task status, messages, pending calls, and proposal state.
- Returning to AI reattaches to the same running task.
- Explicit Stop still aborts and produces a resumable stopped task.
- Plan approval and Continue still work after reattachment.
- Leaving the entire workspace follows the documented pause/detach behavior.

### Failover

- A successful request uses one key and does not rotate.
- A quota error immediately tries the next key with the same model and conversation.
- A transient provider error tries the next key.
- Invalid model/key and non-retryable errors do not rotate through the pool.
- All-key exhaustion returns safe retry metadata without exposing key material.
- No fixed five-second delay is introduced between key attempts.

### Verification gates

All targeted tests, full tests, type checking, and production build must pass before deployment. Live verification must confirm:

- The stable Chrono domain returns Gemini as the server provider.
- The default is `gemini-flash-latest` for accounts without a preference.
- A test account can save another eligible model and retrieve it from a separate session.
- A live agent request reports the selected model.
- Key failover occurs only after a simulated or observed retryable error.

## Boundaries

### Always do

- Keep Gemini as the only server-managed default provider.
- Preserve `gemini-flash-latest` as the default and safe fallback.
- Validate model IDs server-side.
- Persist only the selected model preference, never API keys.
- Run targeted tests and the production build before commit/deployment.
- Redact secrets and avoid logging full prompts or provider responses.

### Ask first

- Adding a new database migration or changing the account schema.
- Adding paid-only or preview Gemini models to the user selector.
- Changing the server-managed key pool or its environment variables.
- Changing behavior so the app silently switches models after a model failure.
- Changing the workspace boundary so tasks continue after leaving a project entirely.

### Never do

- Never expose server Gemini keys to users or the browser.
- Never rotate keys after successful requests.
- Never pretend that keys from the same Google project provide independent quota.
- Never delete the existing Groq database records.
- Never make Groq visible or selectable again.
- Never cancel a run merely because the AI panel changed pages within the same workspace.

## Success criteria

1. A signed-in user can select an eligible server Gemini model, save it, open Chrono on another device, and see the same selection.
2. A new account continues to use `gemini-flash-latest` by default.
3. The agent endpoint uses the account’s selected model on every step, including after key failover.
4. Switching among workspace tabs does not stop a running task.
5. The agent changes keys only after retryable Gemini errors and continues without an artificial delay.
6. All key/model errors remain typed, safe, and actionable.
7. Existing database provider records remain intact, while Groq stays hidden and unusable in the application.
8. Type checks, targeted tests, full tests, and production build pass.

## Approved decisions

1. **Workspace exit behavior:** Pause the task when the user leaves the entire project route, save it as recoverable, and show Continue when the user returns. Switching tabs within the same workspace must not pause it.
2. **Model availability refresh:** Cache server Gemini model availability for exactly 10 minutes. The selector may use cached results during that window and refresh after expiry or an explicit retry.
3. **Fallback on model removal:** If the selected model is removed, becomes unavailable, or is no longer accepted by the configured Gemini key pool, automatically reset the account preference to `gemini-flash-latest`, continue safely where possible, and show a non-blocking notice explaining the fallback.
