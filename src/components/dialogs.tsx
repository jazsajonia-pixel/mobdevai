import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/** Confirmation bottom sheet for destructive actions. */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  danger = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          disabled={busy}
          data-testid="button-confirm"
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}

/** Bottom sheet with a single path/text input and inline validation errors. */
export function InputSheet({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial = "",
  placeholder,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  /** Throw to show the message inline. */
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial);
      setError(null);
    }
  }, [open, initial]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3 pt-1"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "input-sheet-error" : undefined}
            data-testid="input-sheet"
            className="h-11 w-full rounded-md border bg-background px-3 font-mono text-base aria-[invalid=true]:border-danger"
          />
        </label>
        {error ? (
          <p id="input-sheet-error" role="alert" className="text-sm text-danger" data-testid="text-sheet-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy || !value.trim()} data-testid="button-sheet-submit">
          {submitLabel}
        </Button>
      </form>
    </BottomSheet>
  );
}
