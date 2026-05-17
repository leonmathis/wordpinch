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
  "oklch(0.66 0.16 25)", // warm red-orange
  "oklch(0.7 0.14 80)", // amber
  "oklch(0.66 0.14 150)", // green
  "oklch(0.66 0.12 210)", // teal-blue
  "oklch(0.62 0.16 280)", // violet
  "oklch(0.66 0.16 340)", // pink
];

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
};

/**
 * Initial-in-a-circle avatar. Background colour is derived from the name
 * so the same player keeps the same colour across renders / sessions.
 * Initials are forced uppercase; first character of the trimmed name —
 * falling back to "?" if empty.
 */
export function Avatar({ name, size = 24, className, dim = false }: Props) {
  const trimmed = name?.trim() ?? "";
  const initial = (trimmed[0] ?? "?").toUpperCase();
  const color = PALETTE[hashName(trimmed) % PALETTE.length];
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
