import { FlaskConical } from "lucide-react";
import { useSession } from "@/stores/session";

/** Persistent label so nobody mistakes demo activity for real GitHub activity. */
export function DemoBanner() {
  const { session } = useSession();
  if (session.mode !== "demo") return null;
  return (
    <div
      role="note"
      data-testid="banner-demo"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs font-medium text-warning"
    >
      <FlaskConical className="size-3.5" aria-hidden />
      <span>DEMO — sample project, nothing is pushed to GitHub</span>
    </div>
  );
}
