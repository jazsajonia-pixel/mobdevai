import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useSession } from "@/stores/session";

/** Protected-route guard. Anonymous visitors are sent to sign-in. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { isAuthed } = useSession();
  if (!isAuthed) return <Redirect to="/signin" replace />;
  return <>{children}</>;
}
