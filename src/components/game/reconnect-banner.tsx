"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Persistent status banner shown when the room's Realtime channel is
 * reconnecting. Rendered at viewport top by WordpinchUI so it stays
 * visible across phase changes.
 *
 * After {@link STALE_AFTER_MS} of continuous "reconnecting" status the
 * banner switches to an "Still trying — refresh?" prompt so the user has
 * a way out when the auto-reconnect doesn't get there. Without this,
 * Realtime's internal backoff can keep retrying silently while the room
 * appears frozen.
 */
const STALE_AFTER_MS = 12_000;

export function ReconnectBanner() {
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setStale(true), STALE_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute left-0 right-0 z-[3] flex justify-center px-4 pointer-events-none"
      style={{ top: 12 }}
    >
      <Alert className="max-w-sm backdrop-blur-sm bg-background/85 shadow-sm pointer-events-auto">
        {stale ? <RefreshCw /> : <Loader2 className="animate-spin" />}
        <AlertDescription className="flex items-center gap-3">
          <span>
            {stale
              ? "Still reconnecting — try refreshing"
              : "Reconnecting…"}
          </span>
          {stale ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Refresh
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}
