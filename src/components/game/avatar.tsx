"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pastel Pop shape fills. They stay pastel in both themes and always carry
 * ink initials, so contrast does not depend on the page background.
 */
const PALETTE = [
  "var(--shape-pink)",
  "var(--shape-sage)",
  "var(--shape-blue)",
  "var(--shape-yellow)",
];

/**
 * Fixed palette slots for the two seats. The name hash alone gave both
 * players the same colour whenever their names collided in the palette
 * (the out-of-the-box "Host"/"guest" pair did exactly that), which defeats
 * the point of a colour-coded avatar.
 */
const SIDE_SLOT = { host: 0, guest: 1 } as const;

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
        // Urbanist, not Gochi Hand: at avatar size Gochi's "G" reads as a "6".
        "inline-flex items-center justify-center rounded-full font-extrabold text-[#141414] shrink-0 transition-opacity",
        dim ? "opacity-40" : "opacity-100",
        className
      )}
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.48),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
