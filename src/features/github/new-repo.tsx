import { useEffect, useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AppError, describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { githubApi } from "./api";
import type { RepoSummary } from "@/types/github";

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/** Client-side mirror of the server's name rules, for instant feedback. */
export function repoNameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (name.length > 100) return "Repository names can be at most 100 characters.";
  if (!NAME_RE.test(name)) return "Use only letters, numbers, '-', '_' and '.'.";
  if (name === "." || name === "..") return "That name isn't allowed.";
  return null;
}

/** GitHub turns spaces etc. into dashes — do the same so what you see is what you get. */
function normalize(raw: string): string {
  return raw.replace(/\s+/g, "-");
}

export function NewRepoSheet({
  open,
  onOpenChange,
  owner,
  canCreatePrivate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: string;
  canCreatePrivate: boolean;
  onCreated: (repo: RepoSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [readme, setReadme] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setVisibility("public");
      setReadme(true);
      setError(null);
    }
  }, [open]);

  const nameErr = repoNameError(name);

  async function submit() {
    if (!name.trim() || nameErr) return;
    setBusy(true);
    setError(null);
    try {
      const repo = await githubApi.createRepo({
        name: name.trim(),
        description: description.trim() || undefined,
        private: visibility === "private",
        autoInit: readme,
      });
      onOpenChange(false);
      onCreated(repo);
    } catch (e) {
      setError(e instanceof AppError ? e.message || describeError(e).title : "Couldn't create the repository.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title="New repository" description={`Creates an empty repository on GitHub under ${owner}.`}>
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        data-testid="form-new-repo"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <div className={cn("flex h-11 items-center rounded-md border bg-background focus-within:border-primary", nameErr && "border-danger")}>
            <span className="max-w-[45%] truncate pl-3 font-mono text-sm text-muted-foreground">{owner}/</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(normalize(e.target.value))}
              placeholder="my-app"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={100}
              aria-invalid={!!nameErr}
              aria-describedby={nameErr ? "new-repo-name-error" : undefined}
              data-testid="input-repo-name"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-base outline-none sm:text-sm"
            />
          </div>
          {nameErr ? (
            <span id="new-repo-name-error" className="mt-1 block text-xs text-danger">
              {nameErr}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={350}
            placeholder="What is this project?"
            data-testid="input-repo-description"
            className="h-11 w-full rounded-md border bg-background px-3 text-base focus:border-primary sm:text-sm"
          />
        </label>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Visibility</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["public", "private"] as const).map((v) => {
              const disabled = v === "private" && !canCreatePrivate;
              const Icon = v === "public" ? Globe : Lock;
              return (
                <label
                  key={v}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors",
                    visibility === v && "border-primary bg-primary/5",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="repo-visibility"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={visibility === v}
                    disabled={disabled}
                    onChange={() => setVisibility(v)}
                    data-testid={`radio-repo-${v}`}
                  />
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="capitalize">{v}</span>
                </label>
              );
            })}
          </div>
          {!canCreatePrivate ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Private repositories need private access — sign in again with “Include private repositories”.</p>
          ) : null}
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3">
          <span className="py-2 text-sm">
            Add a README
            <span className="block text-xs text-muted-foreground">Gives the repository a first commit so you can open it right away.</span>
          </span>
          <Switch checked={readme} onCheckedChange={setReadme} label="Add a README" data-testid="switch-repo-readme" />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger" data-testid="text-new-repo-error">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={busy || !name.trim() || !!nameErr} data-testid="button-create-repo">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Creating…
            </>
          ) : (
            "Create repository"
          )}
        </Button>
      </form>
    </BottomSheet>
  );
}
