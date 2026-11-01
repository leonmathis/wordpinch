"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Shape, type ShapeKind } from "./shape";

export type Mode = {
  id: string;
  kind: ShapeKind;
  fill: string;
  title: string;
  sub: string;
  onSelect?: () => void;
  /** The mode whose request is in flight; the others fade while busy. */
  busy?: boolean;
};

/**
 * Shape buttons for the ways to play. Labels are two lines so they keep
 * ≥12px (aim ~20px) off every outline; see docs/redesign/02 §Text inside
 * shapes. `size` is the layout box per shape.
 */
export function ModeGrid({
  modes,
  size,
  busy = false,
  className,
  ...rest
}: { modes: Mode[]; size: number; busy?: boolean; className?: string } & React.ComponentProps<"div">) {
  const single = modes.length === 1;
  return (
    <div
      className={cn(single ? "flex justify-center" : "grid grid-cols-2 justify-items-center gap-2.5", className)}
      {...rest}
    >
      {modes.map((m) => (
        <Button
          key={m.id}
          variant="ghost"
          disabled={busy}
          onClick={m.onSelect}
          aria-label={`${m.title.replace("\n", " ")}: ${m.sub}`}
          className="h-auto rounded-none p-0 hover:bg-transparent disabled:opacity-100 aria-expanded:bg-transparent"
          style={busy && !m.busy ? { opacity: 0.45 } : undefined}
        >
          <Shape kind={m.kind} size={single ? Math.round(size * 1.25) : size} fill={m.fill} tilt={-6}>
            <span
              className="leading-[1.05] font-extrabold whitespace-pre-line"
              style={{ fontSize: single ? Math.round(size * 0.15) : Math.round(size * 0.1125) }}
            >
              {m.title}
            </span>
            <span className="font-bold" style={{ fontSize: Math.round(size * 0.075) }}>
              {m.sub}
            </span>
          </Shape>
        </Button>
      ))}
    </div>
  );
}
