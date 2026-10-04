import { Suspense, lazy } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionProvider } from "@/stores/session";
import { ThemeProvider } from "@/stores/theme";
import { RequireSession } from "@/features/auth/require-session";
import LandingPage from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import HomePage from "@/pages/home";
import ProjectsPage from "@/pages/projects";
import AIPage from "@/pages/ai";
import PreviewPage from "@/pages/preview";
import SettingsPage from "@/pages/settings";
import NotFoundPage from "@/pages/not-found";
import { Spinner } from "@/components/states";

// The workspace carries the editor (CodeMirror) — load it only when a project is opened.
const WorkspacePage = lazy(() => import("@/pages/workspace"));

/**
 * Hash routing keeps deep links working on any static host (Netlify, previews, embedded
 * frames) without server rewrites. OAuth callbacks are handled by functions and then
 * redirect to a hash route.
 */
export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/app">
        <RequireSession>
          <HomePage />
        </RequireSession>
      </Route>
      <Route path="/app/projects">
        <RequireSession>
          <ProjectsPage />
        </RequireSession>
      </Route>
      <Route path="/app/projects/:owner/:repo/:tab?">
        {(params) => (
          <RequireSession>
            <Suspense fallback={<div className="grid h-dvh place-items-center"><Spinner label="Opening workspace" /></div>}>
              <WorkspacePage params={params} />
            </Suspense>
          </RequireSession>
        )}
      </Route>
      <Route path="/app/ai">
        <RequireSession>
          <AIPage />
        </RequireSession>
      </Route>
      <Route path="/app/preview">
        <RequireSession>
          <PreviewPage />
        </RequireSession>
      </Route>
      <Route path="/app/settings">
        <RequireSession>
          <SettingsPage />
        </RequireSession>
      </Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SessionProvider>
          <Router hook={useHashLocation}>
            <AppRoutes />
          </Router>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
