import { useState } from "react";
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen, Trash2 } from "lucide-react";
import type { TreeNode } from "@/types/workspace";
import { cn } from "@/lib/utils";

function FileIcon({ name }: { name: string }) {
  return /\.(tsx?|jsx?|css|html|json)$/.test(name) ? (
    <FileCode2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  ) : (
    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  );
}

export type FileMark = "added" | "modified" | "unsaved";

const MARK_STYLE: Record<FileMark, { cls: string; label: string; letter: string }> = {
  added: { cls: "text-[hsl(var(--diff-add))]", label: "added", letter: "A" },
  modified: { cls: "text-warning", label: "modified", letter: "M" },
  unsaved: { cls: "text-primary", label: "unsaved", letter: "●" },
};

export function Mark({ mark }: { mark: FileMark | undefined }) {
  if (!mark) return null;
  const m = MARK_STYLE[mark];
  return (
    <span className={cn("ml-auto shrink-0 pl-2 font-mono text-[11px] font-semibold", m.cls)} aria-label={m.label} title={m.label}>
      {m.letter}
    </span>
  );
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  marks?: ReadonlyMap<string, FileMark>;
  active?: string | null;
}

function folderMarked(node: TreeNode, marks?: ReadonlyMap<string, FileMark>): boolean {
  if (!marks || marks.size === 0) return false;
  const prefix = `${node.path}/`;
  for (const k of marks.keys()) if (k.startsWith(prefix)) return true;
  return false;
}

function Node({ node, depth, onOpen, onDelete, marks, active }: NodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: `${12 + depth * 16}px` };

  if (node.type === "file") {
    return (
      <li className="group flex h-11 items-center" style={pad}>
        <button type="button" onClick={() => onOpen(node.path)} data-testid={`file-${node.path}`} aria-current={active === node.path ? "true" : undefined} className={cn("flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm", active === node.path && "bg-surface-2")}>
          <span className="w-4" aria-hidden />
          <FileIcon name={node.name} />
          <span className="truncate font-mono text-[13px]">{node.name}</span>
          <Mark mark={marks?.get(node.path)} />
        </button>
        <button type="button" aria-label={`Delete ${node.name}`} title={`Delete ${node.name}`} onClick={() => onDelete(node.path)} className="mr-2 grid size-8 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus:opacity-100" data-testid={`button-delete-file-${node.path}`}><Trash2 className="size-3.5" /></button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2.5 pr-3 text-left text-sm hover:bg-surface-2"
        style={pad}
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        {open ? <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden /> : <Folder className="size-4 shrink-0 text-primary" aria-hidden />}
        <span className="truncate font-mono text-[13px]">{node.name}</span>
        {folderMarked(node, marks) ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-warning" aria-label="contains changes" /> : null}
      </button>
      {open && node.children ? (
        <ul>
          {node.children.map((child) => (
            <Node key={child.path} node={child} depth={depth + 1} onOpen={onOpen} onDelete={onDelete} marks={marks} active={active} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({ nodes, onOpen, onDelete, marks, active }: { nodes: TreeNode[]; onOpen: (path: string) => void; onDelete: (path: string) => void; marks?: ReadonlyMap<string, FileMark>; active?: string | null }) {
  return (
    <ul aria-label="Files" className="py-1">
      {nodes.map((n) => (
        <Node key={n.path} node={n} depth={0} onOpen={onOpen} onDelete={onDelete} marks={marks} active={active} />
      ))}
    </ul>
  );
}
