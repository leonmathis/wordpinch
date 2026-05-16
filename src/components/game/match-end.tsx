"use client";

import { Fragment } from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function MatchEnd({ ctx }: { ctx: GameCtx }) {
  const youWon = ctx.you.score > ctx.them.score;

  return (
    <>
      <TopChrome
        round={ctx.total}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
      />
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
            {youWon ? `${ctx.you.name} wins` : `${ctx.them.name} wins`}{" "}
            <span className="text-muted-foreground">
              {ctx.you.score}–{ctx.them.score}
            </span>
          </h1>

          <div style={{ marginTop: 24 }}>
            <Separator />
            <div className="scoreboard-row" data-winner={youWon ? "true" : "false"}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <span className="wp-dot" aria-hidden />
                <span>{ctx.you.name}</span>
              </div>
              <span className="font-mono tabular-nums">{ctx.you.score}</span>
            </div>
            <Separator />
            <div className="scoreboard-row" data-winner={!youWon ? "true" : "false"}>
              <div className="flex items-center" style={{ gap: 10 }}>
                <span className="wp-dot" aria-hidden />
                <span>{ctx.them.name}</span>
              </div>
              <span className="font-mono tabular-nums">{ctx.them.score}</span>
            </div>
            <Separator />
          </div>

          <section style={{ marginTop: 28 }}>
            <div className="t-label-up" style={{ marginBottom: 8 }}>
              Words played
            </div>
            <div className="used-list">
              <Separator />
              {ctx.used.map((u, i) => (
                <Fragment key={u.round}>
                  <div className="used-row">
                    <span className="meta">Rd {u.round}</span>
                    <span className="word">{u.word}</span>
                    <span className="ipa">{u.ipa}</span>
                    <span className="by">won by {u.by}</span>
                  </div>
                  {i < ctx.used.length - 1 ? <Separator /> : null}
                </Fragment>
              ))}
              <Separator />
            </div>
          </section>

          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 28 }}
            onClick={() => ctx.setPhase("lobby")}
          >
            Rematch
          </Button>
          <Button
            variant="ghost"
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 8 }}
            onClick={() => ctx.setPhase("landing")}
          >
            Leave
          </Button>
        </div>
      </div>
    </>
  );
}
