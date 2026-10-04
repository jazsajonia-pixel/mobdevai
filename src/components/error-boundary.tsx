import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

interface State {
  error: Error | null;
}

/** Last-resort boundary: a crash in one screen never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Forwarded to /api/client-errors (message + trimmed stack + route only — never file contents).
    console.error("[ui] unhandled error", error.message, info.componentStack);
    reportError("boundary", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="text-lg font-semibold">This screen crashed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your local drafts are safe. Reload to continue — if it keeps happening, go back home.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border bg-surface p-3 text-left font-mono text-xs text-muted-foreground">
          {this.state.error.message}
        </pre>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => (window.location.hash = "#/")}>
            Home
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
