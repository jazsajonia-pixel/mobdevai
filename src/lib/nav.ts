import { Code2, FolderGit2, GitBranch, Home, LayoutDashboard, MonitorSmartphone, Settings, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Global navigation (bottom bar on phones, rail on desktop). */
export const MAIN_NAV: NavItem[] = [
  { label: "Home", href: "/app", icon: Home },
  { label: "Projects", href: "/app/projects", icon: FolderGit2 },
  { label: "AI", href: "/app/ai", icon: Sparkles },
  { label: "Preview", href: "/app/preview", icon: MonitorSmartphone },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

/** Tabs in the workspace bottom bar. */
export const WORKSPACE_NAV_TABS = ["files", "ai", "preview", "git"] as const;
/** All workspace views; "overview" (project dashboard) opens from the header. */
export const WORKSPACE_TABS = [...WORKSPACE_NAV_TABS, "overview"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const WORKSPACE_TAB_META: Record<WorkspaceTab, { label: string; icon: LucideIcon }> = {
  files: { label: "Files", icon: Code2 },
  ai: { label: "AI", icon: Sparkles },
  preview: { label: "Preview", icon: MonitorSmartphone },
  git: { label: "Git", icon: GitBranch },
  overview: { label: "Overview", icon: LayoutDashboard },
};

export function isWorkspaceTab(value: string | undefined): value is WorkspaceTab {
  return !!value && (WORKSPACE_TABS as readonly string[]).includes(value);
}

/** Is `href` the active nav item for `location`? "/app" only matches exactly. */
export function isActive(href: string, location: string): boolean {
  if (href === "/app") return location === "/app" || location === "/app/";
  return location === href || location.startsWith(`${href}/`);
}

export function projectPath(owner: string, name: string, tab?: WorkspaceTab): string {
  const base = `/app/projects/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return tab && tab !== "files" ? `${base}/${tab}` : base;
}
