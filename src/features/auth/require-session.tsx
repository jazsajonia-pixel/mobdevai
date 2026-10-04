import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useSession } from "@/stores/session";
import { LogoMark } from "@/components/brand";
import { Spinner } from "@/components/states";

/** Protected-route guard. Waits for the session check, then sends anonymous visitors to sign-in. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { isAuthed, loading } = useSession();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <LogoMark className="size-10" />
          <Spinner label="Checking your session" />
        </div>
      </div>
    );
  }
  if (!isAuthed) return <Redirect to="/signin" replace />;
  return <>{children}</>;
}
