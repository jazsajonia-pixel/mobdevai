# features/ai

Phase 3 — provider settings UI (`provider-form`, `provider-card`, `storage-notice`, `active-provider`).
Phase 4 — chat and agent task view (next).

Keep secrets out of this folder: API keys are typed into `provider-form` and sent once to
`/api/ai/*`; they are never stored in the browser. All provider calls go through netlify/functions.
