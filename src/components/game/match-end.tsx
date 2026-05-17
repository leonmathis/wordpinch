"use client";

import * as React from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { UsedWord } from "@/lib/game/types";
import { Avatar } from "./avatar";
import { playChime } from "@/lib/sound";
import confetti from "canvas-confetti";

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

export function MatchEnd({ ctx }: { ctx: GameCtx }) {
  const router = useRouter();
  const youWon = ctx.you.score > ctx.them.score;
  const tied = ctx.you.score === ctx.them.score;

  React.useEffect(() => {
    playChime();
    // Confetti only for the local winner. Tied matches and losing-side
    // viewers get the chime + scoreboard but no party (avoids the
    // condescending "consolation confetti" pattern). Reduced-motion
    // viewers also opt out.
    if (tied || !youWon) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const burst = (origin: { x: number; y: number }, delay: number) => {
      const t = setTimeout(() => {
        confetti({
          particleCount: 90,
          spread: 70,
          startVelocity: 38,
          origin,
          ticks: 140,
        });
      }, delay);
      return t;
    };
    const t1 = burst({ x: 0.2, y: 0.7 }, 100);
    const t2 = burst({ x: 0.8, y: 0.7 }, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tied, youWon]);

  return (
    <>
      <div className="wp-body">
        <div className="wp-frame scene">
          <div className="t-label-up">Match</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              margin: 0,
              marginTop: 6,
            }}
          >
            {tied
              ? "Tied match"
              : youWon
              ? `${ctx.you.name} wins`
              : `${ctx.them.name} wins`}{" "}
            <span className="text-muted-foreground">
              {ctx.you.score}–{ctx.them.score}
            </span>
          </h1>

          <div style={{ marginTop: 24 }}>
            <Separator />
            <div
              className="scoreboard-row"
              data-winner={!tied && youWon ? "true" : "false"}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <Avatar name={ctx.you.name} />
                <span>{ctx.you.name}</span>
              </div>
              <span className="font-mono tabular-nums">{ctx.you.score}</span>
            </div>
            <Separator />
            <div
              className="scoreboard-row"
              data-winner={!tied && !youWon ? "true" : "false"}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <Avatar name={ctx.them.name} />
                <span>{ctx.them.name}</span>
              </div>
              <span className="font-mono tabular-nums">{ctx.them.score}</span>
            </div>
            <Separator />
          </div>

          <section style={{ marginTop: 28 }}>
            <div className="t-label-up" style={{ marginBottom: 8 }}>
              Rounds
            </div>
            <div>
              {/* Two-column round summary: viewer's own attempts on the
               *  left, opponent's on the right. One row per round, so an
               *  N-round match always renders exactly N rows regardless
               *  of how each round ended. Empty cell ("—") = that player
               *  didn't have a valid submission recorded for that round
               *  (timeout, forfeit, or the other side of a solo win). */}
              <div
                className="font-mono"
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
                <div
                  className="flex items-center gap-2"
                  style={{ padding: "10px 12px 6px" }}
                >
                  <Avatar name={ctx.you.name} size={18} />
                  <span className="text-muted-foreground">{ctx.you.name}</span>
                </div>
                <div
                  className="flex items-center gap-2"
                  style={{ padding: "10px 12px 6px" }}
                >
                  <Avatar name={ctx.them.name} size={18} />
                  <span className="text-muted-foreground">{ctx.them.name}</span>
                </div>
                <Separator className="col-span-3" />
                {Array.from({ length: ctx.total }, (_, i) => i + 1).map((r) => {
                  const entries = ctx.used.filter((u) => u.round === r);
                  const yourEntry = entries.find(
                    (u) => u.by === ctx.you.name
                  );
                  const theirEntry = entries.find(
                    (u) => u.by === ctx.them.name
                  );
                  // Highlight whichever entry was first (lower timeMs) — that's
                  // the round winner. Solo wins still set the winner's time;
                  // late-arriving near-misses also carry a time so we can rank.
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
                      <PlayerCell entry={yourEntry} dim={!yourFirst && theirFirst} />
                      <PlayerCell entry={theirEntry} dim={!theirFirst && yourFirst} />
                      <Separator className="col-span-3" />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </section>

          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 28 }}
            disabled={!ctx.meIsHost}
            onClick={() => {
              if (!ctx.meIsHost) return;
              if (ctx.actions.ready) {
                void ctx.actions.rematch();
              } else {
                ctx.setPhase("lobby");
              }
            }}
          >
            {ctx.meIsHost ? "Rematch" : "Waiting for host…"}
          </Button>
          <Button
            variant="ghost"
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 8 }}
            onClick={() => router.push("/")}
          >
            Leave
          </Button>
        </div>
      </div>
    </>
  );
}
