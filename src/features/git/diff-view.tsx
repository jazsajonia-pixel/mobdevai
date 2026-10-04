import { useEffect, useState } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitRows, type DiffLine, type FileDiff } from "./diff";

const ROW: Record<DiffLine["kind"], string> = {
  add: "bg-[hsl(var(--diff-add)/0.12)]",
  del: "bg-[hsl(var(--diff-del)/0.12)]",
  context: "",
};
const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", context: " " };
const SIGN_CLS: Record<DiffLine["kind"], string> = {
  add: "text-[hsl(var(--diff-add))]",
  del: "text-[hsl(var(--diff-del))]",
  context: "text-muted-foreground/50",
};

function useWide(): boolean {
  const q = "(min-width: 768px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function Unified({ diff }: { diff: FileDiff }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse font-mono text-[12px] leading-5">
        {diff.hunks.map((h, hi) => (
          <tbody key={hi}>
            <tr>
              <td colSpan={4} className="bg-surface-2/70 px-3 py-1 text-[11px] text-muted-foreground">{h.header}</td>
            </tr>
            {h.lines.map((l, i) => (
              <tr key={i} className={ROW[l.kind]} data-kind={l.kind}>
                <td className="w-9 select-none px-1 text-right align-top text-muted-foreground/60 tabular">{l.oldNo ?? ""}</td>
                <td className="w-9 select-none px-1 text-right align-top text-muted-foreground/60 tabular">{l.newNo ?? ""}</td>
                <td className={cn("w-4 select-none text-center align-top", SIGN_CLS[l.kind])} aria-hidden>{SIGN[l.kind]}</td>
                <td className="whitespace-pre pr-4">
                  <span className="sr-only">{l.kind === "add" ? "added: " : l.kind === "del" ? "removed: " : ""}</span>
                  {l.text || " "}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Cell({ line }: { line: DiffLine | null }) {
  if (!line) return <td colSpan={2} className="bg-surface-2/40" />;
  const no = line.kind === "add" ? line.newNo : line.oldNo ?? line.newNo;
  return (
    <>
      <td className={cn("w-9 select-none px-1 text-right align-top text-muted-foreground/60 tabular", ROW[line.kind])}>{no}</td>
      <td className={cn("w-1/2 whitespace-pre-wrap break-all pr-3 align-top", ROW[line.kind])}>{line.text || " "}</td>
    </>
  );
}

function Split({ diff }: { diff: FileDiff }) {
  return (
    <table className="w-full table-fixed border-collapse font-mono text-[12px] leading-5">
      <colgroup>
        <col className="w-10" />
        <col />
        <col className="w-10" />
        <col />
      </colgroup>
      {diff.hunks.map((h, hi) => (
        <tbody key={hi}>
          <tr>
            <td colSpan={4} className="bg-surface-2/70 px-3 py-1 text-[11px] text-muted-foreground">{h.header}</td>
          </tr>
          {splitRows(h).map((r, i) => (
            <tr key={i}>
              <Cell line={r.left && r.left.kind !== "add" ? r.left : null} />
              <Cell line={r.right && r.right.kind !== "del" ? r.right : null} />
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

/** Unified on phones; side-by-side available on wider screens. */
export function DiffView({ diff }: { diff: FileDiff }) {
  const wide = useWide();
  const [mode, setMode] = useState<"unified" | "split">("unified");
  if (diff.tooLarge) {
    return <p className="p-3 text-xs text-muted-foreground">This diff is too large to show on a phone. +{diff.added} −{diff.removed} lines.</p>;
  }
  if (diff.hunks.length === 0) return <p className="p-3 text-xs text-muted-foreground">Empty file.</p>;
  const split = wide && mode === "split";
  return (
    <div data-testid={`diff-${diff.path}`}>
      {wide ? (
        <div className="flex justify-end gap-1 border-b px-2 py-1">
          {(["unified", "split"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("flex h-8 items-center gap-1.5 rounded px-2 text-xs", mode === m ? "bg-surface-2 text-foreground" : "text-muted-foreground")}
            >
              {m === "unified" ? <Rows3 className="size-3.5" /> : <Columns2 className="size-3.5" />}
              {m === "unified" ? "Unified" : "Split"}
            </button>
          ))}
        </div>
      ) : null}
      {split ? <Split diff={diff} /> : <Unified diff={diff} />}
    </div>
  );
}
