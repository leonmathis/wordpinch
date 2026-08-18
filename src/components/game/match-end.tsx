"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar } from "./avatar";
import { RoundsTable } from "./rounds-table";
import { playChime } from "@/lib/sound";
import confetti from "canvas-confetti";

export function MatchEnd({ ctx }: { ctx: GameCtx }) {
  const router = useRouter();
  const youWon = ctx.you.score > ctx.them.score;
  const tied = ctx.you.score === ctx.them.score;
  // Score pair reads in the same order as the headline name: winner first.
  // Printing it always as (you–them) made the loser's screen say
  // "Host wins 0–2" — the winner's name against the loser's score.
  const [leadScore, trailScore] =
    tied || youWon
      ? [ctx.you.score, ctx.them.score]
      : [ctx.them.score, ctx.you.score];
  // Spectators have no seat; they read the board from the host's side.
  const yourSide: "host" | "guest" = ctx.mySide ?? "host";
  const theirSide: "host" | "guest" = yourSide === "host" ? "guest" : "host";

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
            <span className="text-muted-foreground tabular-nums">
              {leadScore}–{trailScore}
            </span>
          </h1>

          <div style={{ marginTop: 24 }}>
            <Separator />
            <div
              className="scoreboard-row"
              data-winner={!tied && youWon ? "true" : "false"}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <Avatar name={ctx.you.name} side={yourSide} />
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
                <Avatar name={ctx.them.name} side={theirSide} />
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
            <RoundsTable ctx={ctx} />
          </section>

          {/* Referee (host, or the guest once the host has gone) can restart.
           *  A rematch needs both players, so it's disabled while the other
           *  side is away rather than silently starting a lobby nobody is
           *  in. */}
          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 28 }}
            disabled={!ctx.meIsReferee || !ctx.opponentOnline}
            onClick={() => {
              if (!ctx.meIsReferee) return;
              if (ctx.actions.ready) {
                void ctx.actions.rematch();
              } else {
                ctx.setPhase("lobby");
              }
            }}
          >
            {!ctx.opponentOnline
              ? `Waiting for ${ctx.them.name} to come back…`
              : ctx.meIsReferee
              ? "Rematch"
              : "Waiting for host…"}
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
