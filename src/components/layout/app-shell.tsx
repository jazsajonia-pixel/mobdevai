import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { MAIN_NAV, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand";
import { DemoBanner } from "./demo-banner";
import { OfflineBanner } from "./offline-banner";

/**
 * Mobile-first application shell.
 * - Phones: sticky top bar + thumb-reachable bottom navigation.
 * - md+: the same items move to a slim left rail; content stays a readable column.
 */
export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-dvh md:pl-20">
      {/* Desktop rail */}
      <nav aria-label="Main" className="fixed inset-y-0 left-0 hidden w-20 flex-col items-center gap-1 border-r bg-surface py-4 md:flex">
        <Link href="/" aria-label="Mobile Development AI home" className="mb-4 grid size-11 place-items-center rounded-md hover:bg-surface-2">
          <LogoMark />
        </Link>
        {MAIN_NAV.map((item) => {
          const active = isActive(item.href, location);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-testid={`rail-${item.label.toLowerCase()}`}
              className={cn(
                "flex w-16 flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium transition-colors",
                active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-5", active && "text-primary")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 bg-background/90 pt-safe backdrop-blur">
          <OfflineBanner />
          <DemoBanner />
          <header className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 border-b px-4">
            <LogoMark className="size-6 md:hidden" />
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
            {actions}
          </header>
        </div>

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-4 md:pb-10">{children}</main>
      </div>

      {/* Phone bottom navigation */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 pb-safe backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MAIN_NAV.map((item) => {
            const active = isActive(item.href, location);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <item.icon className={cn("size-5", active && "text-primary")} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
