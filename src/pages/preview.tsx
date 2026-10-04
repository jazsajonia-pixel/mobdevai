import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { Button } from "@/components/ui/button";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { PROJECT_KIND_LABEL, detectProjectKind } from "@/lib/tree";
import { projectPath } from "@/lib/nav";

export default function PreviewPage() {
  const kind = detectProjectKind(DEMO_FILES);
  return (
    <AppShell title="Preview">
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-surface p-4">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">
            {DEMO_PROJECT.owner}/{DEMO_PROJECT.name}
          </p>
          <p className="text-muted-foreground">Detected: {PROJECT_KIND_LABEL[kind]} — browser-compatible</p>
        </div>
      </div>
      <PhaseBoundary
        phase={5}
        title="Live preview"
        description="Preview renders the actual application in a sandboxed, full-screen frame — never an image or mockup."
        planned={[
          "HTML/CSS/JS first, then Vite + React and TypeScript",
          "Build/runtime errors with readable diagnostics",
          "Refresh, open in new tab, and return to code",
          "Clear message for projects needing a server runtime",
        ]}
      >
        <Button asChild variant="secondary" className="w-full">
          <Link href={projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name)}>Open demo project</Link>
        </Button>
      </PhaseBoundary>
    </AppShell>
  );
}
