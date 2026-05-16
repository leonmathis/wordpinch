"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight } from "lucide-react";
import { playDing } from "@/lib/sound";

export function ResultPhase({ ctx }: { ctx: GameCtx }) {
  const [showDelta, setShowDelta] = React.useState(false);
  React.useEffect(() => {
    playDing();
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setShowDelta(true), 400);
    return () => clearTimeout(t);
  }, []);

  const word = ctx.word;
  const mid = word.slice(1, -1).toLowerCase();

  return (
    <>
      <TopChrome
        round={ctx.round}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
      />
      <div className="wp-body">
        <div className="wp-frame scene">
          <div className="t-label-up">
            {ctx.you.name} won round {ctx.round}
          </div>

          <h1 className="result-word">
            <span className="anchor">{word[0]}</span>
            <span>{mid}</span>
            <span className="anchor">{word[word.length - 1]}</span>
          </h1>

          <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
            <span className="result-ipa">{ctx.ipa}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Play pronunciation"
              className="h-7 w-7"
            >
              <Play strokeWidth={1.7} className="size-[15px]" />
            </Button>
          </div>

          <div style={{ marginTop: 28 }}>
            <div className="def-block">
              <div className="def-label">noun</div>
              <div className="def">The quality or state of being true.</div>
              <div className="ex">&ldquo;the search for scientific truth&rdquo;</div>
            </div>
            <div className="def-block">
              <div className="def-label">noun</div>
              <div className="def">A fact or belief that is accepted as true.</div>
              <div className="ex">&ldquo;the emergence of fundamental truths&rdquo;</div>
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 28 }}>
            <div
              className="flex items-center gap-4 font-mono relative"
              style={{ fontSize: 13 }}
            >
              <span>
                <span className="text-muted-foreground">{ctx.you.name}</span>{" "}
                <span className="tabular-nums">{ctx.you.score}</span>
                {showDelta && (
                  <span
                    className="score-delta float-up"
                    style={{ position: "absolute", marginLeft: 6 }}
                  >
                    +1
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                <span className="text-muted-foreground">{ctx.them.name}</span>{" "}
                <span className="tabular-nums">{ctx.them.score}</span>
              </span>
            </div>
            <Button
              variant="link"
              onClick={() => {
                if (ctx.actions.ready) {
                  void ctx.actions.nextRound();
                } else {
                  ctx.setPhase("matchend");
                }
              }}
              className="link-underline h-auto p-0 gap-1.5 font-mono text-[13px] text-foreground no-underline hover:no-underline"
            >
              Next <ArrowRight strokeWidth={1.7} className="size-[13px]" />
            </Button>
          </div>

          <div className="advance-bar" style={{ marginTop: 14 }}>
            <i />
          </div>
        </div>
      </div>
    </>
  );
}
