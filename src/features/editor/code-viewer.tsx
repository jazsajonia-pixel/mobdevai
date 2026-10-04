import type { WorkspaceFile } from "@/types/workspace";
import { languageFromPath } from "@/lib/tree";
import { formatBytes } from "@/lib/utils";

/**
 * Read-only code view with line numbers. Long lines scroll inside the code block only,
 * so the page itself never overflows horizontally on a phone.
 *
 * TODO(phase-2): replace with the mobile editor (syntax highlighting, tabs, undo/redo,
 * find/replace, unsaved indicator).
 */
export function CodeViewer({ file }: { file: WorkspaceFile }) {
  const lines = file.content.replace(/\n$/, "").split("\n");
  const bytes = new TextEncoder().encode(file.content).length;

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{languageFromPath(file.path)}</span>
        <span aria-hidden>·</span>
        <span className="tabular">{lines.length} lines</span>
        <span aria-hidden>·</span>
        <span className="tabular">{formatBytes(bytes)}</span>
        <span className="ml-auto">Read-only</span>
      </div>
      <div className="overflow-x-auto">
        <pre className="min-w-max py-2 font-mono text-[13px] leading-6" data-testid="code-viewer">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="sticky left-0 w-10 shrink-0 select-none bg-surface pr-3 text-right text-muted-foreground/60 tabular">{i + 1}</span>
              <code className="pr-4">{line || " "}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
