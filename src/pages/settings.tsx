import { useState } from "react";
import { useLocation } from "wouter";
import { LogOut, Moon, Sun } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { BackendStatus } from "@/features/settings/backend-status";
import { useSession } from "@/stores/session";
import { useTheme } from "@/stores/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="rounded-lg border bg-surface p-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { session, signOut } = useSession();
  const [, navigate] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <AppShell title="Settings">
      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              data-testid={`radio-theme-${t}`}
              className="flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary"
            >
              {t === "dark" ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
              {t === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </Section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">AI providers</h2>
        <PhaseBoundary
          phase={3}
          title="AI providers"
          description="Keys you add will be encrypted at rest with a server-side key and only decrypted inside server functions. They are never shown again in plaintext — only a masked hint."
          planned={["OpenAI · Anthropic · Google Gemini · OpenAI-compatible", "Model and base URL per provider", "Test connection, enable/disable, default"]}
        />
      </section>

      <Section title="Backend">
        <BackendStatus />
      </Section>

      <Section title="Account">
        <p className="text-sm text-muted-foreground">
          {session.mode === "demo" ? "You're in demo mode. Leaving clears the demo session for this tab." : "Signed in with GitHub."}
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setConfirmOpen(true)} data-testid="button-signout">
          <LogOut /> {session.mode === "demo" ? "Leave demo" : "Sign out"}
        </Button>
      </Section>

      <p className="mt-6 text-center font-mono text-[11px] text-muted-foreground">Mobile Development AI · v0.1.0 · Phase 0</p>

      <BottomSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={session.mode === "demo" ? "Leave the demo?" : "Sign out?"}
        description="You'll return to the start screen."
      >
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            data-testid="button-confirm-signout"
            onClick={() => {
              setConfirmOpen(false);
              signOut();
              navigate("/");
            }}
          >
            {session.mode === "demo" ? "Leave" : "Sign out"}
          </Button>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
