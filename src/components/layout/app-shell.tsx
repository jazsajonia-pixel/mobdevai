import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Command, Menu, Moon, X, Zap } from "lucide-react";
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
  const workspaceItems = MAIN_NAV.filter((item) => ["Home", "Projects", "AI", "Preview"].includes(item.label));
  const accountItems = MAIN_NAV.filter((item) => item.label === "Settings");
  return <div className="min-h-dvh bg-background">
    <SkipLink />
    {open ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} /> : null}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-sidebar/95 shadow-2xl shadow-black/20 backdrop-blur-xl transition-transform duration-200", open ? "translate-x-0" : "-translate-x-full", "md:translate-x-0")} aria-label="Main navigation">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4"><Link href="/" onClick={() => setOpen(false)} aria-label="Chrono home"><Wordmark /></Link><button type="button" className="grid size-9 place-items-center rounded-lg text-sidebar-muted hover:bg-white/10 hover:text-white md:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <div className="px-3 pt-4"><button type="button" className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-left text-xs text-sidebar-muted transition hover:border-primary/40 hover:bg-primary/10 hover:text-white"><Command className="size-4" aria-hidden /><span className="flex-1">Search workspace</span><kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd></button></div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main workspace navigation">
        <div><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">Workspace</p><div className="space-y-1">{workspaceItems.map((item) => { const active = isActive(item.href, location); return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} data-testid={`nav-${item.label.toLowerCase()}`} className={cn("group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-primary/15 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]" : "text-sidebar-muted hover:bg-white/7 hover:text-white")}><span className={cn("grid size-7 place-items-center rounded-lg", active ? "bg-primary/15" : "bg-white/5 group-hover:bg-white/10")}><item.icon className="size-4" aria-hidden /></span>{item.label}{item.label === "AI" ? <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Beta</span> : null}</Link>; })}</div></div>
        <div><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">Account</p><div className="space-y-1">{accountItems.map((item) => { const active = isActive(item.href, location); return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} data-testid={`nav-${item.label.toLowerCase()}`} className={cn("group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-primary/15 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]" : "text-sidebar-muted hover:bg-white/7 hover:text-white")}><span className={cn("grid size-7 place-items-center rounded-lg", active ? "bg-primary/15" : "bg-white/5 group-hover:bg-white/10")}><item.icon className="size-4" aria-hidden /></span>{item.label}</Link>; })}</div></div>
      </nav>
      <div className="space-y-3 border-t border-white/10 p-3"><div className="rounded-xl border border-primary/20 bg-primary/10 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><Zap className="size-3.5" aria-hidden /> Chrono Studio</div><p className="mt-1 text-[11px] leading-relaxed text-sidebar-muted">Build, preview, and ship from one focused workspace.</p></div><div className="flex items-center gap-2 px-2 text-xs text-sidebar-muted"><Moon className="size-3.5" aria-hidden /> Dark workspace <span className="ml-auto size-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" aria-hidden /></div></div>
    </aside>
    <div className="min-h-dvh md:pl-64"><header className="sticky top-0 z-30 bg-background/80 pt-safe backdrop-blur-xl"><OfflineBanner /><div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 border-b border-border/70 px-4"><button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" data-testid="button-toggle-sidebar" className="grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground hover:text-foreground md:hidden"><Menu className="size-5" /></button><div className="min-w-0 flex-1"><p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:block">Chrono workspace</p><h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1></div><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="size-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />All systems ready</div>{actions}</div></header><main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 outline-none sm:px-6">{children}</main></div>
  </div>;
}
