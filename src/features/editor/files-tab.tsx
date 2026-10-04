import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useWorkspace } from "@/features/workspace/context";
import { FilesBrowser } from "./files-browser";
import { EditorScreen } from "./editor-screen";
import { SearchPanel } from "./search-panel";

type View = "tree" | "editor" | "search";

/** Files tab: tree ↔ editor ↔ project search. Opens straight into the editor when tabs are open. */
export function FilesTab({ gitHref }: { gitHref: string }) {
  const ws = useWorkspace();
  const [view, setView] = useState<View>(() => (ws.data.active ? "editor" : "tree"));

  useEffect(() => {
    if (view === "editor" && !ws.data.active) setView("tree");
  }, [view, ws.data.active]);

  const open = (path: string, line?: number) => {
    ws.openFile(path, line);
    setView("editor");
  };

  if (view === "editor" && ws.data.active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EditorScreen gitHref={gitHref} onOpenSearch={() => setView("search")} />
      </div>
    );
  }
  if (view === "search") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SearchPanel onBack={() => setView("tree")} onOpen={open} />
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <FilesBrowser onOpen={(p) => open(p)} onSearch={() => setView("search")} />
      {ws.data.tabs.length ? (
        <div className="sticky bottom-3 mt-2 flex justify-center px-3">
          <button
            type="button"
            onClick={() => setView("editor")}
            data-testid="button-back-editor"
            className="flex h-11 items-center gap-2 rounded-full border bg-surface px-4 text-sm font-medium shadow-lg"
          >
            {ws.data.tabs.length} open file{ws.data.tabs.length === 1 ? "" : "s"} <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
