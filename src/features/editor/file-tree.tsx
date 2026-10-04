import { useState } from "react";
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen } from "lucide-react";
import type { TreeNode } from "@/types/workspace";
import { cn } from "@/lib/utils";

function FileIcon({ name }: { name: string }) {
  return /\.(tsx?|jsx?|css|html|json)$/.test(name) ? (
    <FileCode2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  ) : (
    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  );
}

function Node({ node, depth, onOpen }: { node: TreeNode; depth: number; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: `${12 + depth * 16}px` };

  if (node.type === "file") {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpen(node.path)}
          data-testid={`file-${node.path}`}
          className="flex h-11 w-full items-center gap-2.5 pr-3 text-left text-sm hover:bg-surface-2 active:bg-surface-2"
          style={pad}
        >
          <span className="w-4" aria-hidden />
          <FileIcon name={node.name} />
          <span className="truncate font-mono text-[13px]">{node.name}</span>
        </button>
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
      </button>
      {open && node.children ? (
        <ul>
          {node.children.map((child) => (
            <Node key={child.path} node={child} depth={depth + 1} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({ nodes, onOpen }: { nodes: TreeNode[]; onOpen: (path: string) => void }) {
  return (
    <ul aria-label="Files" className="py-1">
      {nodes.map((n) => (
        <Node key={n.path} node={n} depth={0} onOpen={onOpen} />
      ))}
    </ul>
  );
}
