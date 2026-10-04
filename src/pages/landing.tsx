import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Bot,
  FlaskConical,
  GitPullRequestArrow,
  KeyRound,
  Layers,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, Wordmark } from "@/components/brand";
import { useSession } from "@/stores/session";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { projectPath } from "@/lib/nav";

const FEATURES = [
  { icon: GitHubIcon, title: "Edit GitHub repositories", body: "Browse branches and files, edit code, and keep every change in a reviewable workspace." },
  { icon: Bot, title: "AI-powered coding", body: "An agent that plans first, edits only the files it needs, and shows its work as diffs." },
  { icon: MonitorSmartphone, title: "Live previews", body: "Render the actual app in a sandboxed, full-screen preview — not a screenshot." },
  { icon: Smartphone, title: "Mobile-first workflow", body: "Bottom sheets, big touch targets and one-handed navigation. Built for phones, not shrunk to fit." },
  { icon: Layers, title: "Multiple AI providers", body: "OpenAI, Anthropic, Gemini or any OpenAI-compatible endpoint, behind one interface." },
  { icon: GitPullRequestArrow, title: "Secure Git workflow", body: "Work on an ai/ branch, review the diff, then commit, push and open a pull request." },
] as const;

const PIPELINE = ["Repository", "AI agent", "Diff", "Preview", "Commit / PR"];

function PhoneIllustration() {
  // Decorative composition of the workspace UI; aria-hidden and non-interactive.
  return (
    <div aria-hidden className="relative mx-auto w-[260px] select-none rounded-[2rem] border bg-surface p-2 shadow-2xl shadow-black/40">
      <div className="overflow-hidden rounded-[1.5rem] border bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <p className="text-[11px] font-semibold">demo/pocket-tasks</p>
            <p className="font-mono text-[10px] text-muted-foreground">ai/mobile-development-ai/task-count</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">2 FILES</span>
        </div>
        <div className="space-y-2 p-3">
          <div className="rounded-md border bg-surface p-2">
            <p className="text-[10px] font-semibold text-muted-foreground">PLAN</p>
            <p className="mt-1 text-[11px] leading-snug">Show remaining tasks in the header and style completed items.</p>
          </div>
          <div className="overflow-hidden rounded-md border font-mono text-[10px] leading-[1.6]">
            <div className="border-b bg-surface px-2 py-1 text-muted-foreground">src/App.jsx</div>
            <div className="bg-danger/10 px-2 text-danger">-  &lt;p&gt;Today&lt;/p&gt;</div>
            <div className="bg-primary/10 px-2 text-primary">+  &lt;p&gt;{"{remaining}"} left today&lt;/p&gt;</div>
            <div className="px-2 text-muted-foreground">   &lt;/header&gt;</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md border py-2 text-center text-[10px] font-medium">Reject</div>
            <div className="rounded-md bg-primary py-2 text-center text-[10px] font-semibold text-primary-foreground">Accept</div>
          </div>
        </div>
        <div className="grid grid-cols-4 border-t py-2 text-center text-[9px] text-muted-foreground">
          <span>Files</span>
          <span className="text-foreground">AI</span>
          <span>Preview</span>
          <span>Git</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { enterDemo, isAuthed } = useSession();
  const [, navigate] = useLocation();

  const tryDemo = () => {
    enterDemo();
    navigate(projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name));
  };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 pt-safe">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href={isAuthed ? "/app" : "/signin"} data-testid="link-signin">
            {isAuthed ? "Open app" : "Sign in"}
          </Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="animate-fade-up">
          <p className="inline-flex items-start gap-2 rounded-md border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            Built for developers who code from their phone
          </p>
          <h1 className="mt-5 text-[2.25rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Build, edit, preview, and ship — <span className="text-primary">from your phone.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Mobile Development AI brings an AI coding agent, GitHub workflows, and live previews into a mobile-first development environment.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="sm:w-auto">
              <Link href="/signin" data-testid="button-start-building">
                Start Building <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" onClick={tryDemo} data-testid="button-try-demo">
              <FlaskConical /> Try Demo
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Demo runs on a bundled sample project — no account or API key needed.</p>
        </div>
        <PhoneIllustration />
      </section>

      <section aria-label="Pipeline" className="border-y bg-surface/60">
        <ol className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-4 scrollbar-none">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex shrink-0 items-center gap-2 text-sm">
              <span className="grid size-6 place-items-center rounded-full border font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="font-medium">{step}</span>
              {i < PIPELINE.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-xl font-semibold tracking-tight">Everything between a repo and a pull request</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">One pipeline, designed for a 6-inch screen.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="bg-background p-5">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-6 rounded-lg border bg-surface p-6 md:grid-cols-[auto_1fr]">
          <ShieldCheck className="size-8 text-primary" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">Secrets stay on the server</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex gap-2"><KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden /> AI keys are only used inside server functions — never in browser JavaScript.</li>
              <li className="flex gap-2"><GitHubIcon className="mt-0.5 shrink-0" /> GitHub sign-in uses OAuth with minimal scopes. No passwords.</li>
              <li className="flex gap-2"><GitPullRequestArrow className="mt-0.5 size-4 shrink-0" aria-hidden /> Changes land on a working branch, never silently on main.</li>
              <li className="flex gap-2"><MonitorSmartphone className="mt-0.5 size-4 shrink-0" aria-hidden /> Previews run sandboxed; repository code never runs on our servers.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Mobile Development AI · Early access</span>
          <span>Demo available now. GitHub sign-in is being rolled out.</span>
        </div>
      </footer>
    </div>
  );
}
