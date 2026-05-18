"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

type Props = {
  /** Value to animate from on mount. */
  from: number;
  /** Final value. */
  to: number;
  /** Animation duration in ms. Default 800. */
  duration?: number;
};

/**
 * Tiny one-shot count-up. Renders the integer between `from` and `to`,
 * eased with cubic-out. Pure rAF (no framer animation overhead since the
 * thing we're animating is text content, not a transform).
 *
 * Honours `prefers-reduced-motion` — snaps directly to `to`.
 */
export function CountUp({ from, to, duration = 800 }: Props) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(reduce ? to : from);

  React.useEffect(() => {
    if (from === to) return;
    let raf = 0;
    if (reduce) {
      // Snap to target — scheduled via rAF so the setState happens after
      // the effect body returns (avoids the set-state-in-effect lint).
      raf = requestAnimationFrame(() => setDisplay(to));
      return () => cancelAnimationFrame(raf);
    }
    // When either endpoint isn't an integer (length-bonus enabled),
    // snap interpolation to the nearest 0.5 so the displayed number
    // hits clean half-steps instead of fluttering through 1.2 → 1.3 …
    // before landing on 1.5. With both endpoints integer this collapses
    // to the integer-only behavior we had before.
    const intMode = Number.isInteger(from) && Number.isInteger(to);
    const snap = (v: number) =>
      intMode ? Math.round(v) : Math.round(v * 2) / 2;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(snap(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration, reduce]);

  return <>{display}</>;
}
