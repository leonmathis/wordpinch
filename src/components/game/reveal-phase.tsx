"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { LettersDisplay } from "./letters-display";

export function RevealPhase({ ctx }: { ctx: GameCtx }) {
  const [step, setStep] = React.useState(0);
  const advanceRef = React.useRef(false);

  React.useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 4; i++) {
      ts.push(setTimeout(() => setStep(i), i * 700));
    }
    // After GO + letter template (4.2s), advance to race. Guard against
    // double-fire on remount.
    ts.push(
      setTimeout(() => {
        if (advanceRef.current) return;
        advanceRef.current = true;
        if (ctx.actions.ready) void ctx.actions.advanceToRace();
      }, 4200)
    );
    return () => ts.forEach(clearTimeout);
  }, [ctx.actions]);

  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  const label = ["3", "2", "1", "GO"][step] ?? "";

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
        <div
          className="wp-frame"
          style={{ alignItems: "center", textAlign: "center" }}
        >
          {step < 4 ? (
            <div className="countdown count-pop" key={step}>
              {label}
            </div>
          ) : null}
          {step >= 4 ? <LettersDisplay start={A} end={B} variant="template" animated /> : null}
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
