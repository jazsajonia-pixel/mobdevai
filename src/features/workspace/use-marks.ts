import { useMemo } from "react";
import type { FileMark } from "@/features/editor/file-tree";
import { useWorkspace } from "./context";

/** Path → marker for the file tree and tabs: unsaved draft beats added/modified. */
export function useFileMarks(): Map<string, FileMark> {
  const { data } = useWorkspace();
  return useMemo(() => {
    const m = new Map<string, FileMark>();
    for (const c of Object.values(data.changes)) if (c.status !== "deleted") m.set(c.path, c.status);
    for (const p of Object.keys(data.drafts)) m.set(p, "unsaved");
    return m;
  }, [data.changes, data.drafts]);
}
