"use client";

import { Fragment } from "react";
import type { GameCtx, UsedWord } from "@/lib/game/types";
import { Separator } from "@/components/ui/separator";
import { Avatar } from "./avatar";

/**
 * One cell in the round-summary grid: a player's word + their time (if
 * available). The winner of the round renders at full opacity; the
 * loser (or empty slot) renders dimmed. Pre-formatted secs in tabular
 * mono so the column stays aligned.
 */
function PlayerCell({
  entry,
  dim,
}: {
  entry: UsedWord | undefined;
  dim: boolean;
}) {
  if (!entry) {
    return (
      <div className="self-center" style={{ padding: "10px 12px" }}>
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }
  const secs =
    entry.timeMs !== undefined ? (entry.timeMs / 1000).toFixed(1) : null;
  return (
    <div
      className="self-center flex items-baseline gap-2 min-w-0"
      style={{ padding: "10px 12px", opacity: dim ? 0.55 : 1 }}
    >
      <span className="word truncate">{entry.word}</span>
      {secs !== null ? (
        <span className="text-muted-foreground tabular-nums text-[12px]">
          {secs}s
        </span>
      ) : null}
    </div>
  );
}

/**
 * Per-round match summary: viewer's own attempts on the left, opponent's on
 * the right, one row per round however that round ended.
 *
 * Shared by the player and spectator match-end screens — spectators used to
 * get a bare "X wins" with no way to see what was actually played.
 */
export function RoundsTable({ ctx }: { ctx: GameCtx }) {
  // Spectators hold no seat; they read the board from the host's side.
  const yourSide: "host" | "guest" = ctx.mySide ?? "host";
  const theirSide: "host" | "guest" = yourSide === "host" ? "guest" : "host";

  return (
    <div
      className="font-mono w-full"
      style={{
        fontSize: 13,
        display: "grid",
        gridTemplateColumns: "auto 1fr 1fr",
        columnGap: 12,
      }}
    >
      <Separator className="col-span-3" />
      <div
        className="meta text-muted-foreground"
        style={{ padding: "10px 12px 6px" }}
      >
        &nbsp;
      </div>
      <div className="flex items-center gap-2" style={{ padding: "10px 12px 6px" }}>
        <Avatar name={ctx.you.name} size={18} side={yourSide} />
        <span className="text-muted-foreground">{ctx.you.name}</span>
      </div>
      <div className="flex items-center gap-2" style={{ padding: "10px 12px 6px" }}>
        <Avatar name={ctx.them.name} size={18} side={theirSide} />
        <span className="text-muted-foreground">{ctx.them.name}</span>
      </div>
      <Separator className="col-span-3" />
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
            : outcome?.reason === "forfeit"
            ? `${
                outcome.winner === yourSide ? ctx.you.name : ctx.them.name
              } won — opponent left`
            : outcome?.reason === "timeout"
            ? outcome.winner === "split"
              ? "Out of time — both scored"
              : "Out of time — nobody scored"
            : outcome
            ? "No word played"
            : null;
        // Highlight whichever entry was first (lower timeMs) — that's the
        // round winner. Solo wins still set the winner's time; late-arriving
        // near-misses also carry a time so we can rank.
        const yourTime = yourEntry?.timeMs;
        const theirTime = theirEntry?.timeMs;
        const yourFirst =
          yourTime !== undefined &&
          (theirTime === undefined || yourTime < theirTime);
        const theirFirst =
          theirTime !== undefined &&
          (yourTime === undefined || theirTime < yourTime);
        return (
          <Fragment key={r}>
            <div
              className="meta text-muted-foreground self-center"
              style={{ padding: "10px 0 10px 12px" }}
            >
              Rd {r}
            </div>
            {outcomeLabel ? (
              <div
                className="col-span-2 self-center text-muted-foreground"
                style={{ padding: "10px 12px" }}
              >
                {outcomeLabel}
              </div>
            ) : (
              <>
                <PlayerCell entry={yourEntry} dim={!yourFirst && theirFirst} />
                <PlayerCell entry={theirEntry} dim={!theirFirst && yourFirst} />
              </>
            )}
            <Separator className="col-span-3" />
          </Fragment>
        );
      })}
    </div>
  );
}
