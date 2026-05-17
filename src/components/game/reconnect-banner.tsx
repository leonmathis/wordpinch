import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Persistent status banner shown when the room's Realtime channel is
 * reconnecting. Rendered at viewport top by WordpinchUI so it stays
 * visible across phase changes.
 */
export function ReconnectBanner() {
  return (
    <div
      className="absolute left-0 right-0 z-[3] flex justify-center px-4 pointer-events-none"
      style={{ top: 12 }}
    >
      <Alert className="max-w-sm backdrop-blur-sm bg-background/85 shadow-sm">
        <Loader2 className="animate-spin" />
        <AlertDescription>Reconnecting…</AlertDescription>
      </Alert>
    </div>
  );
}
