import { CheckCircle2, CircleDashed } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { useHealth } from "./use-health";

/** Shows which server-side capabilities are configured. Values are never sent to the browser — only booleans. */
export function BackendStatus() {
  const health = useHealth();

  if (health.status === "loading") {
    return (
      <div className="space-y-2" aria-label="Checking backend">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }

  if (health.status === "error") return <ErrorState error={health.error} onRetry={health.retry} />;

  const c = health.data.capabilities;
  const rows: [string, boolean, string][] = [
    ["GitHub OAuth app", c.githubOAuth, "GITHUB_CLIENT_ID · GITHUB_CLIENT_SECRET"],
    ["Session signing", c.sessions, "SESSION_SECRET"],
    ["Database", c.database, "DATABASE_URL"],
    ["Key encryption", c.encryption, "ENCRYPTION_KEY"],
  ];

  return (
    <ul className="divide-y" data-testid="list-backend-status">
      {rows.map(([label, ok, vars]) => (
        <li key={label} className="flex items-center gap-3 py-2.5">
          {ok ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Configured" />
          ) : (
            <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label="Not configured" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm">{label}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{vars}</p>
          </div>
          <span className="text-xs text-muted-foreground">{ok ? "Ready" : "Not set"}</span>
        </li>
      ))}
    </ul>
  );
}
