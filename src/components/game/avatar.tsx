"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 6-step hue palette spaced ~60° around the wheel. Lightness and chroma are
 * fixed so every colour reads well over both light and dark backgrounds
 * with white initials on top. Using oklch so the perceptual lightness is
 * uniform (rgb hand-picked palettes drift here).
 */
const PALETTE = [
  "oklch(0.48 0.16 25)", // warm red-orange
  "oklch(0.5 0.13 80)", // amber
  "oklch(0.47 0.12 150)", // green
  "oklch(0.48 0.12 210)", // teal-blue
  "oklch(0.48 0.16 280)", // violet
  "oklch(0.48 0.15 340)", // pink
];

/**
 * Fixed palette slots for the two seats. The name hash alone gave both
 * players the same colour whenever their names collided in the 6-slot
 * palette (the out-of-the-box "Host"/"guest" pair did exactly that), which
 * defeats the point of a colour-coded avatar. Seats are far apart on the
 * wheel so they never read as the same person.
 */
const SIDE_SLOT = { host: 1, guest: 3 } as const;

/**
 * Stable hash → palette index. djb2-ish; not crypto, just spreads inputs
 * across the buckets evenly enough that two adjacent names rarely collide.
 */
function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

type Props = {
  name: string;
  /** Pixel size of the circle. Default 24. */
  size?: number;
  className?: string;
  /** When true, dim the avatar to indicate offline / inactive. */
  dim?: boolean;
  /**
   * Which seat this avatar represents. When given, the colour comes from
   * the seat rather than the name hash, so the two players are always
   * distinguishable (and stay the same colour on both screens).
   */
  side?: "host" | "guest";
};

/**
 * Initial-in-a-circle avatar. Background colour is derived from the name
 * so the same player keeps the same colour across renders / sessions.
 * Initials are forced uppercase; first character of the trimmed name —
 * falling back to "?" if empty.
 */
export function Avatar({ name, size = 24, className, dim = false, side }: Props) {
  const trimmed = name?.trim() ?? "";
  const initial = (trimmed[0] ?? "?").toUpperCase();
  const color =
    PALETTE[side ? SIDE_SLOT[side] : hashName(trimmed) % PALETTE.length];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full font-mono font-semibold text-white shrink-0 transition-opacity",
        dim ? "opacity-40" : "opacity-100",
        className
      )}
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
