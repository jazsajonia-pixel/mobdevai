import { AppShell } from "@/components/layout/app-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { ActiveProviderLink } from "@/features/ai/active-provider";

export default function AIPage() {
  return (
    <AppShell title="AI">
      <div className="space-y-4">
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider</h2>
          <ActiveProviderLink />
        </section>
        <PhaseBoundary
          phase={4}
          title="AI coding agent"
          description="The agent works inside a project: it reads the repository, writes a plan, proposes diffs, and waits for your approval. It will use the default provider above."
          planned={[
            "Plan before substantial changes; confirm risky operations",
            "Explicit, logged tools (read_file, search_code, apply_patch…)",
            "Multi-file edits shown as reviewable diffs",
            "Repository content treated as data, never as instructions",
          ]}
        />
      </div>
    </AppShell>
  );
}
