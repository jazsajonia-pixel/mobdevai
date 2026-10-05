import { ShippedNote } from "@/features/git/shipped-note";
import { useOnline } from "@/hooks/use-online";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { History, Image as ImageIcon, KeyRound, Loader2, Paperclip, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/states";
import { useProviders } from "@/features/ai/use-providers";
import { useWorkspace } from "@/features/workspace/context";
import { AppError, isErrorCode } from "@/lib/errors";
import { safeStorage } from "@/lib/storage";
import { projectPath } from "@/lib/nav";
import { MAX_AGENT_STEPS } from "@/lib/agent-tools";
import type { AgentMode } from "@/types/agent";
import { Composer, type QuickAction } from "./composer";
import { DEMO_SUGGESTIONS } from "./demo-agent";
import { Markdown } from "./markdown";
import { PlanCard } from "./plan-card";
import { ProposalSummary, ReviewSheet } from "./proposal-review";
import { resultsById, splitUserMessage, type AgentTask } from "./task";
import { ToolRow } from "./tool-row";
import { useAgent, type AgentProject } from "./use-agent";

function Timeline({ task, onApprove, onRevise }: { task: AgentTask; onApprove: () => void; onRevise: (f: string) => void }) {
  const results = useMemo(() => resultsById(task.messages), [task.messages]);
  const running = task.status === "running";
  const planId = task.status === "awaiting_plan" ? task.pending[0]?.id : null;
  return (
    <ol className="space-y-3">
      {task.messages.map((m, i) => {
        if (m.role === "tool") return null;
        if (m.role === "user") {
          const { text, files } = splitUserMessage(m.content);
          return (
            <li key={i} className="flex justify-end" data-testid="msg-user">
              <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/15 px-3 py-2">
                <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
                {files.length ? <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground"><Paperclip className="mr-1 inline size-3" aria-hidden />{files.join(", ")}</p> : null}{m.attachments?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{m.attachments.map((a) => <span key={a.name} className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-primary">{a.mimeType.startsWith("image/") ? <ImageIcon className="size-3" aria-hidden /> : <Paperclip className="size-3" aria-hidden />}{a.name}</span>)}</div> : null}
              </div>
            </li>
          );
        }
        const calls = m.toolCalls ?? [];
        return (
          <li key={i} className="space-y-2" data-testid="msg-assistant">
            {m.content ? <Markdown text={m.content} /> : null}
            {calls.length ? (
              <ul className="space-y-1.5" aria-label="Tool calls">
                {calls.map((c) =>
                  c.name === "propose_plan" && c.args ? (
                    <li key={c.id} className="list-none">
                      <PlanCard call={c} result={results.get(c.id)} awaiting={c.id === planId} onApprove={onApprove} onRevise={onRevise} />
                    </li>
                  ) : (
                    <ToolRow key={c.id} call={c} result={results.get(c.id)} running={running} />
                  ),
                )}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StatusLine({ task, onResume }: { task: AgentTask; onResume: () => void }) {
  if (task.status === "running") {
    const active = task.pending[0];
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-running">
        <Loader2 className="size-4 animate-spin" /> {active ? "Running tools…" : "Thinking…"}
      </p>
    );
  }
  if (task.status === "error" && task.error) {
    const code = isErrorCode(task.error.code) ? task.error.code : "INTERNAL";
    return <ErrorState error={new AppError(code, task.error.message)} onRetry={onResume} />;
  }
  if (task.status === "stopped" || task.status === "step_limit") {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground" data-testid="status-stopped">
        <span className="flex-1">{task.status === "stopped" ? "Stopped." : `Paused after ${MAX_AGENT_STEPS} steps.`}</span>
        <Button size="sm" variant="secondary" onClick={onResume} data-testid="button-resume-agent">
          <RotateCw /> Continue
        </Button>
      </div>
    );
  }
  return null;
}

export function AgentPanel({ project }: { project: AgentProject }) {
  const ws = useWorkspace();
  const isDemo = project.source === "demo";
  const providers = useProviders();
  const agent = useAgent(project);
  // One-shot hand-off from other tabs (e.g. Preview → "Fix with AI").
  const [prefill] = useState(() => {
    const key = `agent-prefill:${ws.source.storageKey}`;
    const raw = safeStorage.get(key, "session");
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { text?: unknown; mode?: unknown };
      return typeof v.text === "string" ? { text: v.text, mode: v.mode === "ask" ? ("ask" as const) : ("agent" as const) } : null;
    } catch {
      return null;
    }
  });
  const [mode, setMode] = useState<AgentMode>(prefill?.mode ?? agent.task?.mode ?? "agent");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const task = agent.task;

  // A hand-off starts a fresh task.
  useEffect(() => {
    if (!prefill) return;
    safeStorage.remove(`agent-prefill:${ws.source.storageKey}`, "session"); // consume once (after mount; StrictMode-safe)
    agent.startNew();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (task && !prefill) setMode(task.mode);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the conversation as it grows.
  const size = task ? task.messages.length + Object.keys(task.proposal).length + task.status.length : 0;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [size]);

  const ready = providers.state.status === "ready" ? providers.state.data : null;
  const def = ready?.providers.find((p) => p.id === ready.defaultId) ?? null;
  const online = useOnline();
  const needsProvider = !isDemo && providers.state.status === "ready" && !def;
  const providerLabel = isDemo ? "Chrono AI" : def ? `${def.label} · ${def.model}` : providers.state.status === "loading" ? "Loading provider…" : "No provider";

  const active = ws.data.active;
  const quick: QuickAction[] = isDemo
    ? DEMO_SUGGESTIONS.map((s) => ({ label: s, mode: /explain/i.test(s) ? "ask" : "agent", text: s }))
    : [
        ...(active
          ? [
              { label: "Explain this", mode: "ask" as const, text: `Explain how @${active} works.` },
              { label: "Fix this", mode: "agent" as const, text: `Fix the bug in @${active}: ` },
              { label: "Find bugs", mode: "ask" as const, text: `Find bugs or risky code in @${active}.` },
            ]
          : []),
        { label: "Implement…", mode: "agent", text: "Implement: " },
        { label: "Review changes", mode: "ask", text: "Review my uncommitted changes (use get_git_status with include_diff) and point out bugs or improvements." },
      ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <Link href="/app/settings/ai" className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 hover:bg-surface-2" data-testid="link-agent-provider">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate font-mono text-xs">{providerLabel}</span>
        </Link>
        <Button variant="ghost" size="icon" aria-label="Task history" onClick={() => setHistoryOpen(true)} data-testid="button-agent-history">
          <History />
        </Button>
        <Button variant="ghost" size="icon" aria-label="New task" onClick={agent.startNew} disabled={!task} data-testid="button-new-task">
          <Plus />
        </Button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="agent-scroll">
        {needsProvider ? (
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="Add an AI provider"
            action={
              <Button asChild>
                <Link href="/app/settings/ai">Open AI providers</Link>
              </Button>
            }
          >
            The agent uses your default provider (OpenAI, Anthropic, Gemini or compatible). Keys stay on the server.
          </EmptyState>
        ) : providers.state.status === "error" && !isDemo ? (
          <ErrorState error={providers.state.error} onRetry={providers.reload} />
        ) : !task ? (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto size-8 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">{isDemo ? "Ask Chrono" : `Ask about ${project.repo}`}</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              "Ask mode answers questions. Agent mode inspects the repo, shows a plan, and proposes edits you review as diffs. Nothing is saved until you accept, and nothing reaches GitHub until you commit."
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Timeline task={task} onApprove={() => agent.approvePlan()} onRevise={agent.revisePlan} />
            <StatusLine task={task} onResume={agent.resume} />
            {task.shipped ? <ShippedNote info={task.shipped} /> : null}
            <ProposalSummary proposal={task.proposal} onReview={() => setReviewOpen(true)} previewHref={projectPath(project.owner, project.repo, "preview")} />
            {task.provider && task.status === "done" ? (
              <p className="text-center font-mono text-[10px] text-muted-foreground">
                {task.provider.label} · {task.provider.model}
                {task.usage.inputTokens ? ` · ${task.usage.inputTokens + task.usage.outputTokens} tokens` : ""}
              </p>
            ) : null}
          </div>
        )}
        {!agent.storageOk ? <p className="mt-3 text-center text-xs text-warning">This browser's storage is full — task history won't survive a reload.</p> : null}
      </div>

      {agent.pending.length && !reviewOpen ? (
        <button type="button" onClick={() => setReviewOpen(true)} className="flex h-10 shrink-0 items-center justify-center gap-2 border-t bg-primary/10 text-sm font-medium text-primary" data-testid="bar-review">
          Review {agent.pending.length} proposed change{agent.pending.length === 1 ? "" : "s"}
        </button>
      ) : null}

      <Composer
        mode={mode}
        onModeChange={setMode}
        running={agent.running}
        disabled={needsProvider || (!isDemo && !online)}
        placeholder={!isDemo && !online ? "You're offline — the agent needs a connection" : task?.status === "awaiting_plan" ? "Suggest plan changes…" : mode === "ask" ? "Ask about the code…" : "Describe a change…"}
        paths={ws.paths}
        activeFile={active}
        quickActions={task ? [] : quick}
        onSend={(text, attach, uploads) => void agent.send(text, { mode, attach, uploads })}
        onStop={agent.stop}
        initialText={prefill?.text}
      />

      {task ? (
        <ReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          proposal={task.proposal}
          isDemo={isDemo}
          onAccept={agent.accept}
          onReject={agent.reject}
          conflictsFor={agent.conflictsFor}
        />
      ) : null}

      <BottomSheet open={historyOpen} onOpenChange={setHistoryOpen} title="Tasks" description={`Saved on this device for ${project.repo} @ ${project.branch}.`}>
        {agent.tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {agent.tasks.map((t) => (
              <li key={t.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    agent.selectTask(t.id);
                    setHistoryOpen(false);
                  }}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left"
                  data-testid={`task-${t.id}`}
                >
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {t.mode} · {t.status.replace("_", " ")} · {new Date(t.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </button>
                <Button variant="ghost" size="icon" aria-label={`Delete task ${t.title}`} onClick={() => agent.removeTask(t.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          className="mt-3 w-full"
          variant="secondary"
          onClick={() => {
            agent.startNew();
            setHistoryOpen(false);
          }}
        >
          <Plus /> New task
        </Button>
      </BottomSheet>
    </div>
  );
}
