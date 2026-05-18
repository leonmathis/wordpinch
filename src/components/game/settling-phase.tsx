"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Loading view shown between submission and result. Covers the wait
 * window where one of two things is happening server-side:
 *
 *   1. We're inside the 500 ms tie window — either we just submitted
 *      first and the resolver is sleeping, or we landed second within
 *      the window and our attempt was appended to `pendingResult`.
 *   2. The resolver has decided a solo winner and is holding its
 *      broadcast for ~600 ms to absorb a near-miss before mounting
 *      the result phase on either client.
 *
 * Showing this overlay during that window means the result phase only
 * ever mounts with the *final* per-round outcome, so users never see
 * "you won" flash to "you won by 200 ms" or "you lost" flash to a
 * near-miss reveal. Triggered from `WordpinchUI` whenever the local
 * client has a pending submission of its own.
 */
export function SettlingPhase() {
  const reduce = useReducedMotion();
  return (
    <div className="wp-body">
      <div className="wp-frame flex-1 flex flex-col items-center justify-center">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-5"
        >
          <div className="flex gap-2.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block rounded-full bg-foreground"
                style={{ width: 10, height: 10 }}
                animate={
                  reduce
                    ? { opacity: [0.35, 1, 0.35] }
                    : { y: [0, -10, 0], opacity: [0.35, 1, 0.35] }
                }
                transition={{
                  duration: 1.1,
                  delay: i * 0.18,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <span className="t-label-up">Tallying the round</span>
        </motion.div>
      </div>
    </div>
  );
}
