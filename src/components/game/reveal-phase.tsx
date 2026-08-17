"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { LettersDisplay } from "./letters-display";
import { OpponentAwayBanner } from "./opponent-away";
import { playTick } from "@/lib/sound";

export function RevealPhase({ ctx }: { ctx: GameCtx }) {
  const [step, setStep] = React.useState(0);
  const advanceRef = React.useRef(false);
  // `actionsRef` keeps the latest actions reachable from the setTimeout
  // callback without listing `ctx.actions` as a dep — that identity
  // changes on every broadcast and would restart the countdown.
  const actionsRef = React.useRef(ctx.actions);
  const refereeRef = React.useRef(ctx.meIsReferee);
  React.useEffect(() => {
    actionsRef.current = ctx.actions;
    refereeRef.current = ctx.meIsReferee;
  });

  React.useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 4; i++) {
      ts.push(
        setTimeout(() => {
          setStep(i);
          if (i < 4) playTick();
        }, i * 700)
      );
    }
    // After GO + letter template (4.2s), the referee advances to race. The
    // other client fires the same call as a no-op — they snap to race via
    // the state broadcast. Reading the referee flag from a ref means a
    // handover that lands mid-countdown still advances the round.
    ts.push(
      setTimeout(() => {
        if (advanceRef.current) return;
        advanceRef.current = true;
        const a = actionsRef.current;
        if (a.ready && refereeRef.current) void a.advanceToRace();
      }, 4200)
    );
    return () => ts.forEach(clearTimeout);
  }, []);

  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  const label = ["3", "2", "1", "GO"][step] ?? "";

  return (
    <>
      <div className="wp-body">
        <div
          className="wp-frame"
          style={{ alignItems: "center", textAlign: "center" }}
        >
          {/* Reveal is a fixed 4.2 s countdown driven by the referee's
           *  client. If the other player vanishes here, this banner is what
           *  eventually resolves the round instead of stalling on "GO". */}
          {!ctx.opponentOnline ? (
            <div className="w-full">
              <OpponentAwayBanner ctx={ctx} />
            </div>
          ) : null}
          {step < 4 ? (
            <div className="countdown count-pop" key={step}>
              {label}
            </div>
          ) : null}
          {step >= 4 ? (
            <LettersDisplay
              start={A}
              end={B}
              variant="template"
              animated
              gaps={ctx.minWordLength - 2}
            />
          ) : null}
          {step >= 4 ? (
            <div
              className="t-label-up"
              style={{
                marginTop: 28,
                opacity: 0.7,
                animation: "fade-up 600ms 400ms cubic-bezier(0.16,1,0.3,1) both",
              }}
            >
              Type a word that begins with{" "}
              <b style={{ color: "var(--foreground)" }}>{A}</b> and ends with{" "}
              <b style={{ color: "var(--foreground)" }}>{B}</b>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
