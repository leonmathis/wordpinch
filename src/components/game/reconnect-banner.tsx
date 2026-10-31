"use client";

import * as React from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./kit/status-pill";

/**
 * Both banners render in normal flow inside `.wp-banners` (see globals.css),
 * which clears the fixed top chrome and shrinks `.wp-body` by its own
 * height. They used to be absolutely positioned at `top: 12`, where they
 * covered the top-bar controls on narrow screens — and, when two of them
 * were up at once, each other.
 */
const BANNER = "max-w-sm";

/**
 * Shown when we couldn't work out whether this client is the host, the
 * guest or a spectator. Offers the retry that the silent
 * fall-through-to-spectator behaviour never did.
 */
export function RoleErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <StatusPill
      tone="attention"
      role="alert"
      icon={<TriangleAlert />}
      className={BANNER}
      action={
        <Button variant="pill" size="pill-md" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      Couldn&rsquo;t confirm your seat in this room.
    </StatusPill>
  );
}

/**
 * Persistent status banner shown when the room's Realtime channel is
 * reconnecting. Rendered at viewport top by WordpinchUI so it stays
 * visible across phase changes.
 *
 * After {@link STALE_AFTER_MS} of continuous "reconnecting" status the
 * banner switches to a "Still reconnecting" prompt so the user has a way
 * out when the auto-reconnect doesn't get there. Without this, Realtime's
 * internal backoff can keep retrying silently while the room appears
 * frozen.
 */
const STALE_AFTER_MS = 12_000;

export function ReconnectBanner() {
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setStale(true), STALE_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return stale ? (
    <StatusPill
      icon={<RefreshCw />}
      iconFill="var(--shape-yellow)"
      className={BANNER}
      action={
        <Button
          variant="pill"
          size="pill-md"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Refresh
        </Button>
      }
    >
      Still reconnecting. Try refreshing.
    </StatusPill>
  ) : (
    <StatusPill icon={<Loader2 className="motion-safe:animate-spin" />} className={BANNER}>
      Reconnecting…
    </StatusPill>
  );
}
