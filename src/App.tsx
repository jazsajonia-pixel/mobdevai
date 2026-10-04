import { Suspense, lazy, useEffect, useRef } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionProvider } from "@/stores/session";
import { ThemeProvider } from "@/stores/theme";
import { RequireSession } from "@/features/auth/require-session";
import LandingPage from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import HomePage from "@/pages/home";
import NotFoundPage from "@/pages/not-found";
import { Spinner } from "@/components/states";

// The workspace carries the editor (CodeMirror) — load it only when a project is opened.
// Secondary pages are split too so the landing/sign-in/home path stays small on phones.
const WorkspacePage = lazy(() => import("@/pages/workspace"));
const AIProvidersPage = lazy(() => import("@/pages/ai-providers"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const PreviewPage = lazy(() => import("@/pages/preview"));
const HistoryPage = lazy(() => import("@/pages/history"));
const AIPage = lazy(() => import("@/pages/ai"));
const ProjectsPage = lazy(() => import("@/pages/projects"));

/**
 * Hash routing keeps deep links working on any static host (Netlify, previews, embedded
 * frames) without server rewrites. OAuth callbacks are handled by functions and then
 * redirect to a hash route.
 */
export function AppRoutes() {
  const [location] = useLocation();
  const transitionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = transitionRef.current;
    if (!page) return;
    page.classList.remove("route-transition");
    void page.offsetWidth;
    page.classList.add("route-transition");
  }, [location]);

  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center"><Spinner label="Loading" /></div>}>
    <div ref={transitionRef} className="min-h-dvh">
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
      <Route path="/app/ai/history/:owner?/:repo?">
        {(params) => (
          <RequireSession>
            <HistoryPage params={params} />
          </RequireSession>
        )}
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
      <Route path="/app/settings/ai">
        <RequireSession>
          <AIProvidersPage />
        </RequireSession>
      </Route>
      <Route component={NotFoundPage} />
    </Switch>
    </div>
    </Suspense>
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
