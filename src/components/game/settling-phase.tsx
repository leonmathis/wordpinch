"use client";

import { motion, useReducedMotion } from "motion/react";
import { Shape } from "./kit/shape";

/** The three loader shapes, bobbing at staggered heights. */
const BOBS = [
  { kind: "circle", fill: "var(--shape-blue)", lift: 0 },
  { kind: "square", fill: "var(--shape-yellow)", lift: 28 },
  { kind: "star", fill: "var(--shape-pink)", lift: 10 },
] as const;

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
export function SettlingPhase({ word }: { word?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="wp-body">
      <div className="wp-frame flex flex-1 flex-col items-center justify-center text-center">
        <div role="status" className="flex flex-col items-center gap-6">
          <div aria-hidden className="flex h-[90px] items-end gap-3.5" data-settling="shapes">
            {BOBS.map((b, i) => (
              <motion.span
                key={b.kind}
                className="block"
                style={{ marginBottom: b.lift }}
                animate={reduce ? undefined : { y: [0, -12, 0] }}
                transition={{ duration: 1.1, delay: i * 0.18, repeat: Infinity, ease: "easeInOut" }}
              >
                <Shape kind={b.kind} size={40} fill={b.fill} />
              </motion.span>
            ))}
          </div>
          <div>
            <h1 className="m-0 text-4xl leading-[1.05] font-extrabold tracking-[-0.5px] lg:text-[52px]">
              Tallying
              <br />
              <span className="font-hand text-[42px] font-normal tracking-normal lg:text-6xl">the round…</span>
            </h1>
            <p className="mx-auto mt-2.5 mb-0 max-w-[32ch] text-[15px] font-semibold text-muted-foreground [overflow-wrap:anywhere]">
              {word ? (
                <>
                  {"You played "}
                  <strong className="text-foreground uppercase">{word}</strong>
                  {". Checking who was faster."}
                </>
              ) : (
                "Checking who was faster."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
