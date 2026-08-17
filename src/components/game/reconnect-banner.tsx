"use client";

import * as React from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Both banners render in normal flow inside `.wp-banners` (see globals.css),
 * which clears the fixed top chrome and shrinks `.wp-body` by its own
 * height. They used to be absolutely positioned at `top: 12`, where they
 * covered the theme / sound / share icons on narrow screens — and, when two
 * of them were up at once, each other.
 */
const BANNER = "w-full max-w-sm backdrop-blur-sm bg-background/85 shadow-sm";

/**
 * Shown when we couldn't work out whether this client is the host, the
 * guest or a spectator. Offers the retry that the silent
 * fall-through-to-spectator behaviour never did.
 */
export function RoleErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" className={BANNER}>
      <TriangleAlert />
      <AlertDescription className="flex items-center gap-3">
        <span>Couldn&rsquo;t confirm your seat in this room.</span>
        <Button size="xs" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

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
    <Alert className={BANNER}>
      {stale ? <RefreshCw /> : <Loader2 className="animate-spin" />}
      <AlertDescription className="flex items-center gap-3">
        <span>
          {stale ? "Still reconnecting — try refreshing" : "Reconnecting…"}
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
  );
}
