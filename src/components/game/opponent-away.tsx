"use client";

import * as React from "react";
import { Pause } from "lucide-react";
import type { GameCtx } from "@/lib/game/types";
import { StatusPill } from "./kit/status-pill";

/**
 * Grace period (ms) after the opponent drops out of presence before the
 * round is awarded to the player who's still here.
 *
 * 20s, not 10: browsers throttle timers (and with them the Realtime
 * heartbeat) in background tabs, so a player who alt-tabs for a moment can
 * briefly vanish from presence. Ten seconds was short enough to forfeit a
 * round out from under someone who was still very much there — and this
 * countdown now runs in pick and reveal too, right after a join, when
 * presence is at its least settled.
 */
export const FORFEIT_GRACE_MS = 20_000;

/** How often to re-attempt the forfeit if the first attempt was a no-op. */
const RETRY_MS = 2_500;

/** Precomputed so the initial render doesn't redo the division every time. */
const GRACE_SECONDS = Math.ceil(FORFEIT_GRACE_MS / 1000);

/**
 * Shown in pick / reveal / race whenever the opponent has left presence.
 *
 * Two things were wrong before this component existed:
 *  - Only the race phase had it, so a player who left during pick or
 *    reveal stranded the other one on a screen with no timer and no exit.
 *  - The countdown was driven by the *host* alone. When the host was the
 *    one who left, the guest's banner counted down to "forfeits in 0s" and
 *    then sat there forever, because the forfeit action was host-gated.
 *
 * Now whichever client currently holds the referee role (see
 * `ctx.meIsReferee`) fires the forfeit, and it keeps retrying while the
 * banner is mounted so a handover landing mid-countdown still resolves.
 */
export function OpponentAwayBanner({ ctx }: { ctx: GameCtx }) {
  const [secondsLeft, setSecondsLeft] = React.useState(GRACE_SECONDS);

  // Latest values reachable from the timers without re-arming them on every
  // broadcast (ctx.actions changes identity constantly).
  const actionsRef = React.useRef(ctx.actions);
  const refereeRef = React.useRef(ctx.meIsReferee);
  const sideRef = React.useRef(ctx.mySide);
  React.useEffect(() => {
    actionsRef.current = ctx.actions;
    refereeRef.current = ctx.meIsReferee;
    sideRef.current = ctx.mySide;
  });

  React.useEffect(() => {
    let start = Date.now();
    let fired = false;
    let retry: ReturnType<typeof setInterval> | null = null;

    const attemptForfeit = () => {
      const a = actionsRef.current;
      const side = sideRef.current;
      if (a.ready && refereeRef.current && side) void a.forfeitRound(side);
    };

    const tick = () => {
      const elapsed = Date.now() - start;
      setSecondsLeft(
        Math.max(0, Math.ceil((FORFEIT_GRACE_MS - elapsed) / 1000))
      );
      if (elapsed < FORFEIT_GRACE_MS || fired) return;
      fired = true;
      attemptForfeit();
      // The referee role can land a few seconds after the countdown starts
      // (presence handover), so keep trying until this banner unmounts —
      // which happens as soon as the round actually resolves.
      retry = setInterval(attemptForfeit, RETRY_MS);
    };
    tick();
    const ticker = setInterval(tick, 250);

    // Coming back from a background tab restarts the countdown. Our own
    // timers and the Realtime heartbeat were throttled while hidden, so
    // what we "know" about the opponent is stale — give presence a chance
    // to re-sync (and this banner to unmount) before taking a round off
    // someone who never actually left.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || fired) return;
      start = Date.now();
      tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(ticker);
      if (retry) clearInterval(retry);
    };
  }, []);

  return (
    <StatusPill tone="attention" icon={<Pause fill="currentColor" />} className="mb-4">
      {secondsLeft > 0 ? (
        <>
          {ctx.them.name} disconnected. They forfeit in{" "}
          <span className="tabular-nums">{secondsLeft}&nbsp;s</span>.
        </>
      ) : (
        <>{ctx.them.name} is still away. Ending the round…</>
      )}
    </StatusPill>
  );
}
