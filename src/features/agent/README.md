# AI coding agent (Phase 4)

- `use-agent.ts` — controller hook: tasks, run/stop/continue, plan approval, accept/reject → workspace.
- `runner.ts` — the loop: one server step → run tool calls locally → repeat; pauses on `propose_plan`.
- `tools-exec.ts` — tool implementations over a `WorkspaceView` + proposal overlay (never throws).
- `proposal.ts` — staged file changes, `applyEdits` (exact find/replace), conflicts, decisions.
- `task.ts` / `store.ts` — task model, wire/storage compaction, per-workspace `localStorage`.
- UI: `agent-panel.tsx`, `composer.tsx`, `tool-row.tsx`, `plan-card.tsx`, `proposal-review.tsx`, `markdown.tsx`.

Server side: `netlify/functions/ai-agent.ts`, `netlify/lib/ai/agent-step.ts`, `netlify/lib/ai/agent-prompt.ts`.
