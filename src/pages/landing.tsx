import { useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
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
    <div aria-hidden className="hero-phone"><div className="phone-float relative mx-auto w-[260px] select-none rounded-[2rem] border bg-surface p-2 shadow-xl shadow-black/20">
      <div className="overflow-hidden rounded-[1.5rem] border bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <p className="text-[11px] font-semibold">octo/pocket-tasks</p>
            <p className="font-mono text-[10px] text-muted-foreground">chrono/task-count</p>
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
    </div>
  );
}

function TopographicBackdrop() {
  return (
    <div className="topo-field pointer-events-none absolute inset-0 z-0 overflow-hidden text-primary" aria-hidden="true">
      <svg className="topo-lines absolute h-full min-h-[34rem] w-[150%] min-w-[70rem]" viewBox="0 0 1440 700" fill="none" preserveAspectRatio="xMidYMid slice">
        <g className="topo-contours" stroke="currentColor" strokeWidth="1.2" strokeOpacity=".28">
          <path d="M-70 120C72 18 122 60 205 135S347 254 437 162 540 46 626 100s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 145C72 43 122 85 205 160S347 279 437 187 540 71 626 125s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 170C72 68 122 110 205 185S347 304 437 212 540 96 626 150s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 195C72 93 122 135 205 210S347 329 437 237 540 121 626 175s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 220C72 118 122 160 205 235S347 354 437 262 540 146 626 200s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 245C72 143 122 185 205 260S347 379 437 287 540 171 626 225s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 270C72 168 122 210 205 285S347 404 437 312 540 196 626 250s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 295C72 193 122 235 205 310S347 429 437 337 540 221 626 275s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 320C72 218 122 260 205 335S347 454 437 362 540 246 626 300s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 345C72 243 122 285 205 360S347 479 437 387 540 271 626 325s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 370C72 268 122 310 205 385S347 504 437 412 540 296 626 350s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
          <path d="M-70 395C72 293 122 335 205 410S347 529 437 437 540 321 626 375s109 195 211 162 118-170 215-178 138 87 222 15 94-80 166-40" />
        </g>
        <g className="topo-contours topo-contours-secondary" stroke="currentColor" strokeWidth="1" strokeOpacity=".2">
          <path d="M210 520c-65-44-56-118 4-160 52-37 133-37 187 2 58 42 70 116 8 162-55 41-145 39-199-4Z" />
          <path d="M228 508c-51-35-44-92 3-125 41-29 104-29 146 1 45 33 55 91 6 127-43 32-113 30-155-3Z" />
          <path d="M246 496c-37-25-32-66 2-90 29-21 75-21 105 1 32 24 39 66 4 92-31 23-81 22-111-3Z" />
          <path d="M780 135c-49-40-37-105 15-138 49-31 126-27 165 18 39 44 31 106-21 137-49 29-119 20-159-17Z" />
          <path d="M799 124c-34-28-26-74 11-97 35-22 89-19 117 13 27 31 22 75-15 97-35 20-84 14-113-13Z" />
          <path d="M818 113c-19-16-15-42 7-55 20-13 52-11 68 7 15 18 12 43-9 55-20 11-49 8-66-7Z" />
          <path d="M1110 485c-73-50-66-132 2-181 64-46 160-39 211 17 52 57 42 140-27 181-66 39-143 24-186-17Z" />
          <path d="M1132 470c-52-36-47-95 1-130 46-33 115-28 152 12 37 41 30 101-19 130-47 28-103 17-134-12Z" />
          <path d="M1154 455c-31-22-28-57 1-79 28-20 69-17 92 7 22 25 18 61-12 79-28 17-62 10-81-7Z" />
        </g>
      </svg>
      <div className="topo-glow absolute inset-0" />
    </div>
  );
}

/** Reveal sections as they scroll into view. Skipped entirely for reduced motion / no IntersectionObserver. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function LandingPage() {
  const { isAuthed } = useSession();
  const revealRef = useReveal();
  return (
    <div ref={revealRef} className="min-h-dvh overflow-x-hidden">
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

      <main id="main">
      <section className="relative isolate overflow-hidden">
        <TopographicBackdrop />
        <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-12 px-4 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="hero-copy">
          <p className="inline-flex items-start gap-2 rounded-md border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            Built for developers who code from their phone
          </p>
          <h1 className="mt-5 text-[2.25rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Build, edit, preview, and ship — <span className="text-primary">from your phone.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Chrono brings an AI coding agent, GitHub workflows, and live previews into a mobile-first development environment.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="sm:w-auto">
              <Link href="/signin" data-testid="button-start-building">
                Start Building <ArrowRight />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Start with GitHub and keep your provider keys protected on the server.</p>
        </div>
        <PhoneIllustration />
        </div>
      </section>

      <section aria-label="Pipeline" className="border-y bg-surface/60">
        <ol className="stagger mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-4 scrollbar-none">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex shrink-0 items-center gap-2 text-sm">
              <span className="grid size-6 place-items-center rounded-full border font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="font-medium">{step}</span>
              {i < PIPELINE.length - 1 ? <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="reveal mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-xl font-semibold tracking-tight">Everything between a repo and a pull request</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">One pipeline, designed for a 6-inch screen.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature-card bg-background p-5">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mx-auto max-w-5xl px-4 pb-16">
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

      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Chrono · Early access</span>
          <span>GitHub sign-in, AI workspace, and live preview are available in Chrono.</span>
        </div>
      </footer>
    </div>
  );
}
