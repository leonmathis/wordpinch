"use client";

import { Fragment } from "react";
import type { GameCtx, UsedWord } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

/**
 * One cell in the round-summary grid: a player's word + their time (if
 * available). The slower (or empty) side steps back in muted ink rather
 * than opacity, so its text keeps ≥4.5:1.
 */
function PlayerCell({ entry, dim }: { entry: UsedWord | undefined; dim: boolean }) {
  if (!entry) {
    return <span className="text-[15px] font-semibold text-muted-foreground">—</span>;
  }
  const secs = entry.timeMs !== undefined ? `${(entry.timeMs / 1000).toFixed(1)} s` : null;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span
        className={cn(
          "min-w-0 truncate text-[15px] uppercase",
          dim ? "font-semibold text-muted-foreground" : "font-extrabold"
        )}
      >
        {entry.word}
      </span>
      {secs ? <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{secs}</span> : null}
    </span>
  );
}

/**
 * Per-round match summary: viewer's own attempts on the left, opponent's on
 * the right, one row per round however that round ended. Rows alternate
 * with a light stripe; no divider lines.
 *
 * Shared by the player and spectator match-end screens — spectators used to
 * get a bare "X wins" with no way to see what was actually played.
 */
export function RoundsTable({ ctx }: { ctx: GameCtx }) {
  // Spectators hold no seat; they read the board from the host's side.
  const yourSide: "host" | "guest" = ctx.mySide ?? "host";
  const theirSide: "host" | "guest" = yourSide === "host" ? "guest" : "host";
  const nameOf = (side: "host" | "guest") => (side === yourSide ? ctx.you.name : ctx.them.name);
  const cols = "grid grid-cols-[26px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5";

  return (
    <div className="min-w-0 rounded-[28px] bg-card px-4 pt-4 pb-2.5" role="table" aria-label="Rounds">
      <div role="row" className={cn(cols, "pb-2.5 text-sm font-extrabold")}>
        <span role="columnheader" className="text-center text-muted-foreground">
          #
        </span>
        {[yourSide, theirSide].map((side) => (
          <span role="columnheader" key={side} className="flex min-w-0 items-center gap-2">
            <Avatar name={nameOf(side)} size={26} side={side} />
            <span className="truncate">{nameOf(side)}</span>
          </span>
        ))}
      </div>
      {Array.from({ length: ctx.total }, (_, i) => i + 1).map((r) => {
        const entries = ctx.used.filter((u) => u.round === r);
        // Match on the *side*, not the display name — two players who pick
        // the same name would otherwise both read from the same cell.
        const yourEntry = entries.find((u) => u.bySide === yourSide);
        const theirEntry = entries.find((u) => u.bySide === theirSide);
        const outcome = ctx.roundOutcomes.find((o) => o.round === r);
        // Rounds that produced no word (forfeit / timeout) used to render as
        // two blank cells beside a score that had gone up — no explanation
        // anywhere.
        const outcomeLabel =
          entries.length > 0
            ? null
            : outcome?.reason === "forfeit" && (outcome.winner === "host" || outcome.winner === "guest")
              ? `${nameOf(outcome.winner)} won, ${nameOf(outcome.winner === "host" ? "guest" : "host")} left the round`
              : outcome?.reason === "timeout"
                ? outcome.winner === "split"
                  ? "out of time, both scored"
                  : "out of time, nobody scored"
                : outcome
                  ? "no word played"
                  : null;
        // Whichever entry was first (lower timeMs) won the round; the other
        // steps back. Late near-misses carry a time too, so they rank.
        const yourTime = yourEntry?.timeMs;
        const theirTime = theirEntry?.timeMs;
        const yourFirst = yourTime !== undefined && (theirTime === undefined || yourTime < theirTime);
        const theirFirst = theirTime !== undefined && (yourTime === undefined || theirTime < yourTime);
        return (
          <div
            role="row"
            key={r}
            className={cn(cols, "min-h-10 rounded-[14px] py-1", r % 2 === 0 && "bg-row")}
          >
            <span role="rowheader" className="text-center text-[13px] font-bold text-muted-foreground">
              {r}
            </span>
            {outcomeLabel ? (
              <span role="cell" className="col-span-2 font-hand text-[19px] leading-tight text-muted-foreground">
                {outcomeLabel}
              </span>
            ) : (
              <Fragment>
                <span role="cell" className="min-w-0">
                  <PlayerCell entry={yourEntry} dim={!yourFirst && theirFirst} />
                </span>
                <span role="cell" className="min-w-0">
                  <PlayerCell entry={theirEntry} dim={!theirFirst && yourFirst} />
                </span>
              </Fragment>
            )}
          </div>
        );
      })}
    </div>
  );
}
