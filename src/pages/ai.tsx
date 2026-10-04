import { ShippedNote } from "@/features/git/shipped-note";
import { useMemo } from "react";
import { Link } from "wouter";
import { MessageSquareCode, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ActiveProviderLink } from "@/features/ai/active-provider";
import { recentAgentTasks } from "@/features/agent/store";
import { proposalFiles } from "@/features/agent/proposal";
import { projectPath } from "@/lib/nav";
import { useSession } from "@/stores/session";

export default function AIPage() {
  const { session } = useSession();
  const recent = useMemo(() => recentAgentTasks(), []);
  const demo = session.mode !== "github";
  return (
    <AppShell title="AI">
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider</h2>
          <ActiveProviderLink />
        </section>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent agent tasks</h2>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-6" />}
              title="No tasks yet"
              action={
                <Button asChild>
                  <Link href={demo ? projectPath("demo", "pocket-tasks", "ai") : "/app/projects"}>{demo ? "Try the simulated agent" : "Open a project"}</Link>
                </Button>
              }
            >
              The agent works inside a project: open one and use the AI tab to ask questions or request changes.
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border bg-surface">
              {recent.map((r) => {
                const files = proposalFiles(r.task.proposal);
                const pending = files.filter((f) => f.decision === "pending").length;
                return (
                  <li key={`${r.owner}/${r.repo}/${r.task.id}`}>
                    <Link href={projectPath(r.owner, r.repo, "ai")} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2" data-testid={`recent-task-${r.task.id}`}>
                      <MessageSquareCode className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.task.title}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {r.owner}/{r.repo} · {r.task.mode} · {r.task.status.replace("_", " ")}
                        </span>
                      </span>
                      {r.task.shipped ? <ShippedNote info={r.task.shipped} compact /> : null}
                      {pending ? <span className="shrink-0 text-xs font-medium text-warning">{pending} to review</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
