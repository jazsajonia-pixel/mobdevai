import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";

/** Bottom sheet — the primary overlay pattern on phones (thumb-reachable, swipe to dismiss). */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-lg flex-col rounded-t-xl border bg-surface pb-safe outline-none"
          aria-describedby={description ? undefined : undefined}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-0.5 text-sm text-muted-foreground">{description}</Drawer.Description>
              ) : null}
            </div>
            <Drawer.Close
              className="-mr-2 -mt-1 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-surface-2"
              aria-label="Close"
            >
              <X className="size-5" />
            </Drawer.Close>
          </div>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
