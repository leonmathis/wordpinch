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
      className="relative flex-1 flex flex-col w-full"
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
