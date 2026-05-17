"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Wraps a single phase render so `<AnimatePresence>` in WordpinchUI can
 * orchestrate enter/exit animations. The shell carries the layout classes
 * that wp-root expects of its child (flex column, flex-1) so TopChrome's
 * absolute positioning and wp-body's flex-1 keep working.
 *
 * Respects `prefers-reduced-motion` — falls back to a snappy opacity-only
 * crossfade.
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
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{
        duration: reduce ? 0.12 : 0.22,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
