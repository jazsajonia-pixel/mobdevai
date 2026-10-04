import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, GitBranch, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states";
import { PhaseBoundary } from "@/components/phase-boundary";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { projectPath } from "@/lib/nav";

export default function ProjectsPage() {
  const [query, setQuery] = useState("");
  // Phase 0: only the bundled demo project. TODO(phase-1): merge in GET /api/github/repos.
  const projects = useMemo(() => [DEMO_PROJECT], []);
  const filtered = projects.filter((p) => `${p.owner}/${p.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AppShell title="Projects">
      <label className="relative block">
        <span className="sr-only">Search projects</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          data-testid="input-search-projects"
          className="h-11 w-full rounded-md border bg-surface pl-9 pr-3 text-base placeholder:text-muted-foreground sm:text-sm"
        />
      </label>

      <ul className="mt-4 overflow-hidden rounded-lg border">
        {filtered.map((p) => (
          <li key={p.id} className="border-b last:border-b-0">
            <Link
              href={projectPath(p.owner, p.name)}
              data-testid={`row-project-${p.name}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">
                    {p.owner}/{p.name}
                  </span>
                  <Badge tone="warning">{p.visibility}</Badge>
                </p>
                {p.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
                <p className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <GitBranch className="size-3" aria-hidden /> {p.defaultBranch}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? <EmptyState title="No matching projects" className="py-8">Try a different search.</EmptyState> : null}

      <div className="mt-6">
        <PhaseBoundary
          phase={1}
          title="GitHub repositories"
          description="After you sign in with GitHub, your repositories are listed here with visibility and default branch."
          planned={["List and search repositories you can access", "Choose a branch", "Load the file tree"]}
        />
      </div>
    </AppShell>
  );
}
