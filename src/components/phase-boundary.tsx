import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Honest placeholder for a capability that belongs to a later phase.
 * It states what will exist and why it isn't here yet — no fake buttons.
 */
export function PhaseBoundary({
  phase,
  title,
  description,
  planned,
  children,
}: {
  phase: number;
  title: string;
  description: string;
  planned: string[];
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-dashed bg-surface/60 p-4" aria-label={`${title} — planned for phase ${phase}`}>
      <div className="flex items-center gap-2">
        <Construction className="size-4 text-warning" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge tone="warning" className="ml-auto">
          Phase {phase}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-3 space-y-1.5">
        {planned.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
