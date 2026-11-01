import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Neutral: surface pill. Attention: pink pill with ink text. */
  tone?: "neutral" | "attention";
  /** Icon shown in the round badge on the left. */
  icon: React.ReactNode;
  /** Badge fill; defaults to blue (neutral) or ink (attention). */
  iconFill?: string;
  /** Optional trailing control, e.g. a Retry or Refresh pill button. */
  action?: React.ReactNode;
  /** `alert` for errors the player must act on, `status` otherwise. */
  role?: "status" | "alert";
  className?: string;
  children: React.ReactNode;
};

/**
 * Banner pill for reconnecting, seat errors, opponent away and the
 * spectator note. Sits in normal flow so it pushes content down.
 */
export function StatusPill({
  tone = "neutral",
  icon,
  iconFill,
  action,
  role = "status",
  className,
  children,
}: Props) {
  const attention = tone === "attention";
  return (
    <div
      role={role}
      className={cn(
        "flex min-h-13 w-full items-center gap-3 rounded-[26px] py-2 pr-2 pl-2 text-[15px] font-bold leading-tight",
        attention ? "bg-shape-pink text-[#141414]" : "bg-card text-card-foreground",
        action ? null : "pr-4",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]",
          attention ? "text-white" : "text-[#141414]"
        )}
        style={{ background: iconFill ?? (attention ? "#141414" : "var(--shape-blue)") }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
      {action}
    </div>
  );
}
