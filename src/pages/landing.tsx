import { useEffect, useRef, type MutableRefObject } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, Bot, Check, GitBranch, GitPullRequestArrow, KeyRound, Layers, LockKeyhole, MonitorSmartphone, ScanSearch, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, Wordmark } from "@/components/brand";
import { useSession } from "@/stores/session";

const FEATURES = [
  { icon: GitBranch, index: "01", title: "GitHub, in your pocket", body: "Browse branches, open files, and make focused edits without leaving the repo you already trust." },
  { icon: Bot, index: "02", title: "An agent with a plan", body: "Chrono turns a request into a visible plan, then presents every change as a reviewable diff." },
  { icon: MonitorSmartphone, index: "03", title: "Preview the real thing", body: "Run the app in a sandboxed preview so you can see what shipped — not a static screenshot." },
  { icon: Smartphone, index: "04", title: "Designed for one hand", body: "Bottom sheets, thumb-friendly controls, and a calm mobile workflow from first edit to PR." },
  { icon: Layers, index: "05", title: "Bring your model", body: "Use OpenAI, Anthropic, Gemini, OpenRouter, or an OpenAI-compatible endpoint behind one focused interface." },
  { icon: GitPullRequestArrow, index: "06", title: "Ship with confidence", body: "Work on an ai/ branch, review the diff, commit, push, and open a pull request when it is ready." },
] as const;
const PIPELINE = ["Connect", "Plan", "Edit", "Preview", "Ship"];

function useDepthMotion() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.min(window.scrollY, 1600);
      root.style.setProperty("--scroll-depth", `${y}px`);
      root.style.setProperty("--hero-tilt", `${Math.min(y * 0.006, 7)}deg`);
      root.style.setProperty("--hero-scale", `${1 - Math.min(y * 0.000025, 0.035)}`);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  return ref;
}

function WorkspacePreview() {
  return <div className="workspace-stage" aria-hidden="true">
    <div className="workspace-orbit workspace-orbit-one" /><div className="workspace-orbit workspace-orbit-two" />
    <div className="workspace-card workspace-card-main">
      <div className="workspace-topbar"><div className="workspace-dots"><i /><i /><i /></div><span className="workspace-pill">AI WORKSPACE</span><span className="workspace-status"><span /> Ready</span></div>
      <div className="workspace-body">
        <aside className="workspace-sidebar"><span className="workspace-side-title">PROJECT</span><strong><span className="folder-glyph">⌁</span> pocket-tasks</strong><div className="workspace-tree"><span>src</span><span className="active-file">App.jsx</span><span>styles.css</span><span>package.json</span></div><div className="workspace-sidebar-foot"><span /> ai/task-count</div></aside>
        <div className="workspace-editor"><div className="editor-tabs"><span className="tab-active">App.jsx</span><span>task-count</span><span className="editor-actions">•••</span></div><div className="code-lines"><span><b>01</b> <em>import</em> <strong>TaskList</strong> <em>from</em> <u>"./components"</u></span><span><b>02</b> </span><span><b>03</b> <em>export default function</em> <strong>App</strong>() {'{'}</span><span><b>04</b> &nbsp; <em>return</em> <u>&lt;TaskList /&gt;</u></span><span><b>05</b> {'}'}</span><span><b>06</b> </span><span className="code-add"><b>07</b> + <span>const remaining = tasks.filter(active)</span></span></div><div className="editor-footer"><span><GitBranch /> ai/task-count</span><span><ScanSearch /> 2 changes</span></div></div>
      </div>
      <div className="workspace-bottom"><span>Files</span><span className="bottom-active"><Sparkles /> AI</span><span>Preview</span><span>Git</span></div>
    </div>
    <div className="workspace-float workspace-float-plan"><span className="float-icon"><Sparkles /></span><div><small>AGENT PLAN</small><strong>Update task count</strong><span>2 files · ready to review</span></div><Check /></div>
    <div className="workspace-float workspace-float-branch"><GitBranch /><span>ai/task-count</span><i>●</i></div>
  </div>;
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); } }), { rootMargin: "0px 0px -10% 0px" });
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function LandingPage() {
  const { isAuthed } = useSession();
  const revealRef = useReveal();
  const depthRef = useDepthMotion();
  return <div ref={(node) => { (revealRef as MutableRefObject<HTMLDivElement | null>).current = node; (depthRef as MutableRefObject<HTMLDivElement | null>).current = node; }} className="landing-page min-h-dvh overflow-x-hidden">
    <header className="landing-nav mx-auto flex h-20 max-w-6xl items-center justify-between px-5 pt-safe lg:px-8">
      <Link href="/" className="rounded-md"><Wordmark appearance="dark" /></Link>
      <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Landing navigation"><a href="#workflow">Workflow</a><a href="#features">Capabilities</a><a href="#security">Security</a></nav>
      <div className="flex items-center gap-3"><span className="hidden rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground sm:inline-flex"><span className="mr-2 mt-1 size-1.5 rounded-full bg-success" />Early access</span><Button asChild variant="ghost" size="sm"><Link href={isAuthed ? "/app" : "/signin"} data-testid="link-signin">{isAuthed ? "Open app" : "Sign in"}<ArrowUpRight className="ml-1 size-3.5" /></Link></Button></div>
    </header>
    <main id="main">
      <section className="hero-section relative isolate overflow-hidden"><div className="hero-grid" aria-hidden="true" /><div className="hero-glow hero-glow-a" aria-hidden="true" /><div className="hero-glow hero-glow-b" aria-hidden="true" />
        <div className="hero-depth-back" aria-hidden="true"><span className="depth-orb depth-orb-a" /><span className="depth-orb depth-orb-b" /><span className="depth-line depth-line-a" /><span className="depth-line depth-line-b" /></div>
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[.92fr_1.08fr] lg:px-8 lg:pb-28 lg:pt-16">
          <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> AI DEVELOPMENT, REIMAGINED</div><h1>Build what’s next.<br /><span className="hero-highlight">From anywhere.</span></h1><p className="hero-lede">A mobile-first development environment that brings your GitHub repos, AI coding agent, and live previews into one focused workspace.</p><div className="hero-actions"><Button asChild size="lg" className="hero-cta" data-testid="button-start-building"><Link href="/signin">Start building <ArrowRight /></Link></Button><a href="#workflow" className="hero-secondary">See how it works <ArrowRight /></a></div><div className="hero-proof"><span><LockKeyhole /> Provider keys stay server-side</span><span><Zap /> Built for 6-inch screens</span></div></div>
          <div className="hero-visual"><WorkspacePreview /></div>
        </div>
        <div className="hero-scroll-cue" aria-hidden="true"><span>SCROLL TO EXPLORE</span><i /></div>
      </section>
      <section id="workflow" aria-label="Chrono workflow" className="workflow-strip"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-5 lg:px-8"><span className="workflow-label">One clear path to shipped code</span>{PIPELINE.map((step, i) => <div className="workflow-step" key={step}><span>{String(i + 1).padStart(2, "0")}</span><strong>{step}</strong>{i < PIPELINE.length - 1 && <ArrowRight aria-hidden />}</div>)}</div></section>
      <section id="features" className="reveal section-shell mx-auto max-w-6xl px-5 py-24 lg:px-8 lg:py-32"><div className="section-intro"><div><span className="section-kicker">THE WORKSPACE</span><h2>Everything between a repo<br className="hidden sm:block" /> and a pull request.</h2></div><p>Purpose-built for the moments when an idea arrives away from your desk.</p></div><div className="feature-grid">{FEATURES.map(({ icon: Icon, index, title, body }) => <article className="feature-card" key={title}><div className="feature-top"><span className="feature-index">{index}</span><Icon /></div><h3>{title}</h3><p>{body}</p><ArrowUpRight className="feature-arrow" /></article>)}</div></section>
      <section id="security" className="reveal section-shell mx-auto max-w-6xl px-5 pb-24 lg:px-8 lg:pb-32"><div className="security-panel"><div className="security-visual"><div className="security-ring"><ShieldCheck /></div><span className="security-ping security-ping-a" /><span className="security-ping security-ping-b" /></div><div className="security-copy"><span className="section-kicker">CALM BY DEFAULT</span><h2>Your code stays yours.</h2><p>Chrono keeps secrets and repository access behind server-side functions, so you can focus on the change instead of the plumbing.</p><ul><li><KeyRound /><span>AI provider keys never enter browser JavaScript.</span></li><li><GitHubIcon /><span>GitHub OAuth with minimal scopes. No passwords.</span></li><li><GitPullRequestArrow /><span>Every change lands on a working branch first.</span></li></ul></div></div></section>
      <section className="reveal final-cta-section"><div className="final-cta-grid" aria-hidden="true" /><div className="relative z-10 mx-auto max-w-3xl px-5 py-24 text-center lg:py-32"><span className="section-kicker">THE NEXT COMMIT IS CLOSER THAN YOU THINK</span><h2>Make your best ideas<br /><span>shippable anywhere.</span></h2><p>Connect GitHub, bring your model, and get back to building.</p><Button asChild size="lg" className="hero-cta mt-8"><Link href="/signin">Start building <ArrowRight /></Link></Button></div></section>
    </main>
    <footer className="landing-footer"><div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8"><Wordmark appearance="dark" className="opacity-75" /><span>Chrono · Early access</span><span>Built for developers who code from their phone.</span></div></footer>
  </div>;
}
