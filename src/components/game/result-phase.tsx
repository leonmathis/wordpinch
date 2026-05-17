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
  const timeout = ctx.winner === "none";
  // Fallback definitions only render when we somehow lost the API result —
  // never used in normal play, but keeps the UI from showing blank.
  const FALLBACK_DEFS = [
    {
      partOfSpeech: "noun",
      definition: "No definition available.",
      example: undefined,
    },
  ];
  const defs = ctx.definitions.length > 0 ? ctx.definitions : FALLBACK_DEFS;

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
          {timeout ? (
            <div className="t-label-up">
              No one won round {ctx.round} — out of time
            </div>
          ) : (
            <div className="t-label-up">
              {ctx.winner === "guest" ? ctx.them.name : ctx.you.name} won round{" "}
              {ctx.round}
            </div>
          )}

          {!timeout ? (
            <>
              <h1 className="result-word">
                <span className="anchor">{word[0]}</span>
                <span>{mid}</span>
                <span className="anchor">{word[word.length - 1]}</span>
              </h1>

              {ctx.ipa ? (
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
              ) : null}

              <div style={{ marginTop: 28 }}>
                {defs.map((d, i) => (
                  <div key={i} className="def-block">
                    <div className="def-label">{d.partOfSpeech || "—"}</div>
                    <div className="def">{d.definition}</div>
                    {d.example ? (
                      <div className="ex">&ldquo;{d.example}&rdquo;</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between" style={{ marginTop: 28 }}>
            <div
              className="flex items-center gap-4 font-mono relative"
              style={{ fontSize: 13 }}
            >
              <span>
                <span className="text-muted-foreground">{ctx.you.name}</span>{" "}
                <span className="tabular-nums">{ctx.you.score}</span>
                {showDelta && ctx.winner === "host" ? (
                  <span
                    className="score-delta float-up"
                    style={{ position: "absolute", marginLeft: 6 }}
                  >
                    +1
                  </span>
                ) : null}
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
