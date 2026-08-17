"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Volume2, VolumeX, Share2, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  round?: number;
  total: number;
  muted: boolean;
  onToggleMute: () => void;
  onShare?: () => void;
  showShare?: boolean;
  /**
   * Shows the "leave room" exit. True for every in-room view (including
   * spectators) so no phase is ever a dead end — the room lives on the
   * server, so leaving is non-destructive and the URL still works.
   */
  showLeave?: boolean;
};

// 36px hit areas: `icon-xs` (24px) was below the comfortable touch minimum,
// which mattered because these are the only persistent controls on mobile.
const ICON_BUTTON = "size-9 text-muted-foreground";

export function TopChrome({
  round = 0,
  total,
  muted,
  onToggleMute,
  onShare,
  showShare = true,
  showLeave = false,
}: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const pct = total > 0 ? (round / total) * 100 : 0;

  return (
    <>
      <div className="wp-progress" style={{ width: `${pct}%` }} />
      <div className="wp-chrome">
        {/* The wordmark is the conventional "go home" affordance — it used to
         *  be an inert <div>, which left in-room players with no way back. */}
        <Link
          href="/"
          className="wp-brand rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          wordpinch
        </Link>
        <div className="wp-chrome-right">
          {round > 0 ? <div className="wp-counter">{round}/{total}</div> : null}
          <div className="wp-icons">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className={ICON_BUTTON}
            >
              <Sun strokeWidth={1.7} className="size-[15px] hidden dark:block" />
              <Moon strokeWidth={1.7} className="size-[15px] block dark:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              onClick={onToggleMute}
              className={ICON_BUTTON}
            >
              {muted ? (
                <VolumeX strokeWidth={1.7} className="size-[15px]" />
              ) : (
                <Volume2 strokeWidth={1.7} className="size-[15px]" />
              )}
            </Button>
            {showShare ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Share room"
                onClick={onShare}
                className={ICON_BUTTON}
              >
                <Share2 strokeWidth={1.7} className="size-[15px]" />
              </Button>
            ) : null}
            {showLeave ? (
              // A real <a>, not a Button with a link inside it: base-ui's
              // Button expects a native <button> element and logs a
              // semantics warning otherwise.
              <Link
                href="/"
                aria-label="Leave room"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  ICON_BUTTON
                )}
              >
                <LogOut strokeWidth={1.7} className="size-[15px]" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
