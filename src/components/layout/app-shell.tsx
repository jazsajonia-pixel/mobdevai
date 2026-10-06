import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Menu, Search } from "lucide-react";
import { MAIN_NAV, isActive } from "@/lib/nav";
import { openCommandPalette } from "@/features/command/palette-store";
import { Sidebar, SidebarLink, SidebarSection } from "./sidebar";
import { OfflineBanner } from "./offline-banner";

export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("main")?.focus();
      }}
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      Skip to content
    </a>
  );
}

const WORKSPACE_LABELS = ["Home", "Projects", "AI", "Skills", "Preview"];

export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const link = (item: (typeof MAIN_NAV)[number]) => (
    <SidebarLink
      key={item.href}
      href={item.href}
      icon={item.icon}
      label={item.label}
      active={isActive(item.href, location)}
      onNavigate={close}
      testId={`nav-${item.label.toLowerCase()}`}
    />
  );
  return (
    <div className="min-h-dvh bg-background">
      <SkipLink />
      <Sidebar open={open} onClose={close} label="Main navigation">
        <nav aria-label="Main workspace navigation">
          <SidebarSection title="Workspace">{MAIN_NAV.filter((i) => WORKSPACE_LABELS.includes(i.label)).map(link)}</SidebarSection>
          <SidebarSection title="Account">{MAIN_NAV.filter((i) => !WORKSPACE_LABELS.includes(i.label)).map(link)}</SidebarSection>
        </nav>
      </Sidebar>
      <div className="flex min-h-dvh min-w-0 flex-col md:pl-64">
        <header className="sticky top-0 z-30 border-b bg-background pt-safe">
          <OfflineBanner />
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:h-16 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              data-testid="button-toggle-sidebar"
              className="-ml-1 grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground md:hidden"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
            {actions}
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="Search or jump to"
              data-testid="button-header-search"
              className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground md:hidden"
            >
              <Search className="size-5" />
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="route-enter mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 pt-6 outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
