"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GameCtx } from "@/lib/game/types";

/**
 * Grace period (ms) after the opponent drops out of presence before the
 * round is awarded to the player who's still here.
 */
export const FORFEIT_GRACE_MS = 10_000;

/** How often to re-attempt the forfeit if the first attempt was a no-op. */
const RETRY_MS = 2_500;

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
  const [secondsLeft, setSecondsLeft] = React.useState(
    Math.ceil(FORFEIT_GRACE_MS / 1000)
  );

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
    const start = Date.now();
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((FORFEIT_GRACE_MS - (Date.now() - start)) / 1000)
      );
      setSecondsLeft(remaining);
    };
    tick();
    const ticker = setInterval(tick, 250);

    const attemptForfeit = () => {
      const a = actionsRef.current;
      const side = sideRef.current;
      if (a.ready && refereeRef.current && side) void a.forfeitRound(side);
    };
    let retry: ReturnType<typeof setInterval> | null = null;
    const grace = setTimeout(() => {
      attemptForfeit();
      // The referee role can land a few seconds after the countdown starts
      // (presence handover), so keep trying until this banner unmounts —
      // which happens as soon as the round actually resolves.
      retry = setInterval(attemptForfeit, RETRY_MS);
    }, FORFEIT_GRACE_MS);

    return () => {
      clearInterval(ticker);
      clearTimeout(grace);
      if (retry) clearInterval(retry);
    };
  }, []);

  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert />
      <AlertDescription className="font-mono text-[13px]">
        {secondsLeft > 0 ? (
          <>
            {ctx.them.name} disconnected · forfeits in{" "}
            <span className="tabular-nums">{secondsLeft}s</span>
          </>
        ) : (
          <>{ctx.them.name} is still away · ending the round…</>
        )}
      </AlertDescription>
    </Alert>
  );
}
