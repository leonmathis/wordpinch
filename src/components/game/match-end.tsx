"use client";

import * as React from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar } from "./avatar";
import { playChime } from "@/lib/sound";
import confetti from "canvas-confetti";

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
              <Separator />
              {/* Render one block per round 1..total so the list mirrors
               *  the match's structure — earlier this was an unfiltered
               *  map over usedWords, which skipped any round that didn't
               *  produce a written word (nobody-tie, timeout, forfeit).
               *  Now those rounds get a "no word played" row instead. */}
              {(() => {
                const rows: React.ReactNode[] = [];
                const total = ctx.total;
                for (let r = 1; r <= total; r++) {
                  const entries = ctx.used.filter((u) => u.round === r);
                  if (entries.length === 0) {
                    rows.push(
                      <Fragment key={`empty-${r}`}>
                        <div className="used-row">
                          <div className="flex items-baseline gap-3 min-w-0">
                            <span className="meta">Rd {r}</span>
                            <span className="text-muted-foreground italic">
                              no word played
                            </span>
                          </div>
                          <span className="by">—</span>
                        </div>
                        {r < total ? <Separator /> : null}
                      </Fragment>
                    );
                  } else {
                    entries.forEach((u, i) => {
                      rows.push(
                        <Fragment key={`${u.round}-${u.by}-${u.word}-${i}`}>
                          <div className="used-row">
                            <div className="flex items-baseline gap-3 min-w-0">
                              <span className="meta">Rd {u.round}</span>
                              <span className="word truncate">{u.word}</span>
                              <span className="ipa">{u.ipa}</span>
                            </div>
                            <span className="by">won by {u.by}</span>
                          </div>
                          {(r < total || i < entries.length - 1) ? (
                            <Separator />
                          ) : null}
                        </Fragment>
                      );
                    });
                  }
                }
                return rows;
              })()}
              <Separator />
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
