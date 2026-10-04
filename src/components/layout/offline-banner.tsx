import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-danger px-4 py-1.5 text-xs font-medium text-danger-foreground">
      <WifiOff className="size-3.5" aria-hidden /> You're offline — changes stay on this device
    </div>
  );
}
