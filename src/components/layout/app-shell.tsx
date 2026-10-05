import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { MAIN_NAV, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand";
import { OfflineBanner } from "./offline-banner";
export function SkipLink() {
  return <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>;
}
export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  return <div className="min-h-dvh">
    <SkipLink />
    {open ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/35 md:hidden" onClick={() => setOpen(false)} /> : null}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-surface transition-transform duration-200", open ? "translate-x-0" : "-translate-x-full", "md:translate-x-0")} aria-label="Main navigation">
      <div className="flex h-16 items-center justify-between border-b px-4"><Link href="/" onClick={() => setOpen(false)} aria-label="Chrono home"><Wordmark /></Link><button type="button" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 md:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <nav className="flex-1 space-y-1 p-3">{MAIN_NAV.map((item) => { const active = isActive(item.href, location); return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} data-testid={`nav-${item.label.toLowerCase()}`} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}><item.icon className="size-5" aria-hidden />{item.label}</Link>; })}</nav>
    </aside>
    <div className="min-h-dvh md:pl-64"><header className="sticky top-0 z-30 bg-background/90 pt-safe backdrop-blur"><OfflineBanner /><div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 border-b px-4"><button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-toggle-sidebar" className="grid size-9 place-items-center rounded-md border text-muted-foreground hover:text-foreground md:hidden"><Menu className="size-5" /></button><h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>{actions}</div></header><main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-10 pt-4 outline-none">{children}</main></div>
  </div>;
}
