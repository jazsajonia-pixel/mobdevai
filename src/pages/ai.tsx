import { Link } from "wouter";
import { AppShell } from "@/components/layout/app-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { Button } from "@/components/ui/button";

export default function AIPage() {
  return (
    <AppShell title="AI">
      <div className="space-y-4">
        <PhaseBoundary
          phase={4}
          title="AI coding agent"
          description="The agent works inside a project: it reads the repository, writes a plan, proposes diffs, and waits for your approval."
          planned={[
            "Plan before substantial changes; confirm risky operations",
            "Explicit, logged tools (read_file, search_code, apply_patch…)",
            "Multi-file edits shown as reviewable diffs",
            "Repository content treated as data, never as instructions",
          ]}
        />
        <PhaseBoundary
          phase={3}
          title="Provider configuration"
          description="Choose OpenAI, Anthropic, Gemini, or an OpenAI-compatible endpoint. Calls run in server functions only."
          planned={["Per-provider key, model and base URL", "Test connection", "Default provider"]}
        >
          <Button asChild variant="secondary" className="w-full">
            <Link href="/app/settings">Open settings</Link>
          </Button>
        </PhaseBoundary>
      </div>
    </AppShell>
  );
}
