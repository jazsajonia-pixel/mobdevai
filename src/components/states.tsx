import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Shared loading / empty / error UI so every screen handles non-happy paths the same way. */

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 grid size-11 place-items-center rounded-lg border bg-surface text-muted-foreground">{icon}</div> : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {children ? <div className="mt-1 max-w-xs text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { title, hint, code, requestId } = describeError(error);
  return (
    <div role="alert" className={cn("rounded-lg border border-danger/30 bg-danger/5 p-4", className)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          <p className="mt-2 font-mono text-[11px] tracking-wide text-muted-foreground">
            <span className="uppercase">{code}</span>
            {requestId ? <span data-testid="text-request-id"> · ref {requestId}</span> : null}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}
