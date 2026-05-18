"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Wraps a single phase render so `<AnimatePresence>` in WordpinchUI can
 * orchestrate enter/exit animations. The shell carries the layout classes
 * that wp-root expects of its child (flex column, flex-1) so TopChrome's
 * absolute positioning and wp-body's flex-1 keep working.
 *
 * Uses `mode="wait"` (sequential) in the parent, so this shell only ever
 * animates a single phase at a time — no overlap, no two centered
 * containers fighting for the same vertical real estate. Durations are
 * kept short (130/110 ms in/out) so the total swap lands around 240 ms,
 * matching the perceived snappiness of the popLayout overlap without
 * its visual stacking.
 *
 * Respects `prefers-reduced-motion` — falls back to an even shorter
 * opacity-only crossfade.
 */
export function PhaseShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      // `min-h-0` is load-bearing: as a flex item with `flex-1`, the
      // default `min-height: auto` would prevent this shell from
      // shrinking below the intrinsic height of its content. When a
      // phase like Result mounts taller-than-viewport content, that
      // would cascade up — PhaseShell grows → wp-root grows → body
      // grows → html overflows and the *browser* paints a scrollbar
      // (which `wp-body`'s `scrollbar-width: none` can't hide, because
      // the scrollbar is on html, not wp-body). With `min-h-0`,
      // PhaseShell stays the size of its allocated flex slot, wp-body
      // inside is bounded to the viewport, and the only scroll that
      // ever happens is the silent internal scroll of wp-body.
      className="relative flex-1 min-h-0 flex flex-col w-full"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{
        duration: reduce ? 0.1 : 0.13,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
