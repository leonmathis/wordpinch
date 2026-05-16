"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Volume2, VolumeX, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  round?: number;
  total: number;
  muted: boolean;
  onToggleMute: () => void;
  onShare?: () => void;
  showShare?: boolean;
  showBrand?: boolean;
};

export function TopChrome({
  round = 0,
  total,
  muted,
  onToggleMute,
  onShare,
  showShare = true,
  showBrand = true,
}: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const pct = total > 0 ? (round / total) * 100 : 0;

  return (
    <>
      <div className="wp-progress" style={{ width: `${pct}%` }} />
      <div className="wp-chrome">
        {showBrand ? <div className="wp-brand">wordpinch</div> : <div />}
        <div className="wp-chrome-right">
          {round > 0 ? <div className="wp-counter">{round}/{total}</div> : null}
          <div className="wp-icons">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Toggle theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="text-muted-foreground"
            >
              <Sun strokeWidth={1.7} className="size-[15px] hidden dark:block" />
              <Moon strokeWidth={1.7} className="size-[15px] block dark:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Toggle sound"
              onClick={onToggleMute}
              className="text-muted-foreground"
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
                size="icon-xs"
                aria-label="Share room"
                onClick={onShare}
                className="text-muted-foreground"
              >
                <Share2 strokeWidth={1.7} className="size-[15px]" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
