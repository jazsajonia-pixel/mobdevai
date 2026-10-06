# Capability Map: Gemini Model Selection and Agent Continuity

## Scope

This initiative combines three independently testable capabilities. It must keep Gemini as Chrono's only server-managed default provider, preserve `gemini-flash-latest` as the default, and never expose or modify the server API-key pool from the client.

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `gemini-model-selection` | Let each signed-in account choose an eligible server-managed Gemini text-generation model; persist the choice in the account database so it syncs across devices; keep `gemini-flash-latest` as the fallback/default. | Existing account/database provider state; Gemini key pool |
| `agent-run-continuity` | Keep an agent run alive when the user navigates between Chrono pages; persist progress and reattach the UI when the user returns; only stop when the user explicitly stops it or the run reaches an existing pause/error boundary. | Existing task store, runner, workspace lifecycle |
| `gemini-failover-performance` | Use the selected model and current key for normal requests; rotate to another key only after a retryable Gemini failure; avoid artificial waits and preserve retry metadata. | Gemini model selection; existing key pool and adapter |

## Build order

`gemini-model-selection` → `gemini-failover-performance`

`agent-run-continuity` can be implemented in parallel after its persistence/lifecycle contract is approved, then integrated with the selected-model contract.

## Model policy proposed for review

The settings UI should show a curated, text-generation-only Gemini list based on the current official Google API catalog and the configured server key pool:

- `gemini-flash-latest` — **default alias** and fallback
- `gemini-3.8-flash`
- `gemini-3.7-flash`
- `gemini-3.6-flash`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.1-flash-lite`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

The selector should also be able to mark a model unavailable when the server's configured Gemini key pool cannot use it. Image, audio, TTS, Live, embedding, preview-only, and other non-agent models should not appear in this selector.

`gemini-2.5-pro` should not be labeled as a free-tier model without verification: Google's current pricing documentation marks the 2.5 Pro standard free tier as unavailable, even though some existing/older projects may still list or access it. It can be considered later as an explicitly paid/advanced option, but it should not be included in the free-model selector by default.

## Important quota constraint

Google states that Gemini rate limits are applied **per Google Cloud project, not per API key**. Multiple keys from the same project will not create independent quota capacity. Failover can still help when keys belong to separate projects with separate quotas, or when only one key has a transient/key-specific failure, but it cannot guarantee removal of project-level rate limits.

## Boundaries

- Always keep server Gemini as the default provider.
- Always keep `gemini-flash-latest` as the account preference fallback.
- Never send API keys to the browser or store them in account preferences.
- Never rotate keys between successful requests.
- Never delete existing provider/database records as part of this initiative.
- Model selection changes are account preferences, not changes to the server key pool.
- Database schema changes require review before implementation.
