import { cn } from "@/lib/utils";

/** Accessible on/off switch with a 44px touch target. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
  ...rest
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn("grid h-11 w-14 shrink-0 place-items-center disabled:opacity-50", className)}
      {...rest}
    >
      <span className={cn("relative h-6 w-10 rounded-full border transition-colors", checked ? "border-primary bg-primary" : "bg-surface-2")}>
        <span
          className={cn(
            "absolute top-0.5 size-[18px] rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
