import { Link } from "wouter";
import { CheckCircle2, ChevronRight, MonitorPlay, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { recentRepos } from "@/features/github/recent";
import { useSession } from "@/stores/session";
import { projectPath } from "@/lib/nav";

const SUPPORTED = ["Static HTML / CSS / JavaScript (multi-page)", "Vite + React / Preact (JS & TypeScript)", "Create React App", "Tailwind CSS v3 / v4, CSS modules, JSON & asset imports", "npm packages (loaded from esm.sh at your package.json versions)"];
const EDITOR_LANGUAGES = "PHP, Python, Go, Rust, Ruby, SQL, YAML, shell, and TOML files are syntax-highlighted in the editor.";
const NOT_YET = ["Server runtimes: Next.js, Remix, Nuxt, SvelteKit, Astro, Node/Express APIs", "Vue, Svelte, Angular, Solid single-file components", "Native apps: React Native / Expo, Flutter, Electron", "Server-rendered backends and databases (PHP, Python, Go, Ruby…) — these need a runtime/server, not just a browser frame"];

export default function PreviewPage() {
  const { session } = useSession();
  const repos = session.mode === "github" ? recentRepos().slice(0, 8) : [];
  const items = [{ owner: DEMO_PROJECT.owner, name: DEMO_PROJECT.name, demo: true }, ...repos.map((r) => ({ owner: r.owner, name: r.name, demo: false }))];
  return (
    <AppShell title="Preview">
      <p className="mb-4 text-sm text-muted-foreground">
        Runs the real app — including unsaved edits — in a sandboxed frame on this device. Pick a project:
      </p>
      <ul className="mb-6 divide-y overflow-hidden rounded-lg border bg-surface" data-testid="list-preview-projects">
        {items.map((r) => (
          <li key={`${r.owner}/${r.name}`}>
            <Link href={projectPath(r.owner, r.name, "preview")} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2" data-testid={`link-preview-${r.owner}-${r.name}`}>
              <MonitorPlay className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                <span className="text-muted-foreground">{r.owner}/</span>
                {r.name}
              </span>
              {r.demo ? <span className="text-xs text-warning">Demo</span> : null}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {session.mode === "github" && repos.length === 0 ? (
        <p className="-mt-4 mb-6 text-xs text-muted-foreground">
          Open a repository from <Link href="/app/projects" className="text-primary underline-offset-2 hover:underline">Projects</Link> and it will appear here.
        </p>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">Supported</h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {SUPPORTED.map((s) => (
              <li key={s} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">Not in the browser preview yet</h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {NOT_YET.map((s) => (
              <li key={s} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{s}</li>
            ))}
          </ul>
        </div>
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Editor support and browser preview are different: {EDITOR_LANGUAGES} The browser preview only executes frontend code in a sandbox, so PHP and other server languages need deployment or a server runtime to run.</p>
    </AppShell>
  );
}
