"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { LetterSlots } from "./kit/letter-slots";
import { Shape } from "./kit/shape";
import { OpponentAwayBanner } from "./opponent-away";
import { playTick } from "@/lib/sound";

/** One flower per beat, then GO in a magenta star. */
const BEATS = [
  { label: "3", line: "ready…", fill: "var(--shape-yellow)" },
  { label: "2", line: "set…", fill: "var(--shape-pink)" },
  { label: "1", line: "almost…", fill: "var(--shape-sage)" },
] as const;

/**
 * Ink offsets of the Urbanist 800 labels from their line-box centre, in em,
 * measured by pixel scan (tests/e2e/race.spec.ts "beat labels"). "1" and "2"
 * sat 2.3 px and 1.4 px off centre in the 240 px flower without them; "GO"
 * measured within 0.15 px as is.
 */
const BEAT_INK: Record<string, [number, number]> = {
  "3": [0, -0.0023],
  "2": [-0.0104, -0.0091],
  "1": [-0.0205, -0.0023],
  GO: [0, 0],
};
const centreInk = (label: string) => {
  const [dx, dy] = BEAT_INK[label] ?? [0, 0];
  return `translate(${-dx}em, ${-dy}em)`;
};

/** A countdown shape at 240px (phone) or 300px (from 1024px). */
function Beat({ kind, fill, children }: { kind: "flower" | "star"; fill: string; children: (size: number) => React.ReactNode }) {
  return (
    <>
      <Shape kind={kind} size={240} fill={fill} className="lg:hidden">
        {children(240)}
      </Shape>
      <Shape kind={kind} size={300} fill={fill} className="hidden lg:inline-flex">
        {children(300)}
      </Shape>
    </>
  );
}

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
  const beat = step < 3 ? BEATS[step] : null;

  return (
    <div className="wp-body">
      <div className="wp-frame items-center text-center lg:max-w-[720px]">
        {/* Reveal is a fixed 4.2 s countdown driven by the referee's
         *  client. If the other player vanishes here, this banner is what
         *  eventually resolves the round instead of stalling on "GO". */}
        {!ctx.opponentOnline ? (
          <div className="mb-[18px] w-full">
            <OpponentAwayBanner ctx={ctx} className="mb-0" />
          </div>
        ) : null}

        {step < 4 ? (
          // `count-pop` is dropped under reduced motion (globals.css), so
          // the beats swap in place without the scale.
          <div
            key={step}
            role="timer"
            aria-live="assertive"
            aria-label={beat ? beat.label : "Go"}
            className="count-pop flex flex-col items-center gap-[26px]"
          >
            {beat ? (
              <Beat kind="flower" fill={beat.fill}>
                {(size) => (
                  <span
                    aria-hidden
                    className="leading-none font-extrabold text-[#141414]"
                    style={{ fontSize: Math.round(size * 0.46), transform: centreInk(beat.label) }}
                  >
                    {beat.label}
                  </span>
                )}
              </Beat>
            ) : (
              <Beat kind="star" fill="var(--shape-magenta)">
                {(size) => (
                  <span
                    aria-hidden
                    className="leading-none font-extrabold text-white"
                    style={{ fontSize: Math.round(size * 0.32), transform: centreInk("GO") }}
                  >
                    GO
                  </span>
                )}
              </Beat>
            )}
            <div aria-hidden className="font-hand text-[30px]">
              {beat ? beat.line : "pencils up!"}
            </div>
          </div>
        ) : (
          <div className="slide-up-in flex flex-col items-center gap-[26px]">
            <LetterSlots first={A} last={B} size={100} firstFill="var(--shape-yellow)" className="lg:hidden" />
            <LetterSlots first={A} last={B} size={150} firstFill="var(--shape-yellow)" className="hidden gap-5 lg:flex" />
            <div>
              <h1 className="m-0 text-4xl leading-[1.05] font-extrabold tracking-[-0.5px] lg:text-[52px]">
                {`Starts with ${A},`}
                <br />
                <span className="font-hand text-[42px] font-normal tracking-normal lg:text-6xl">{`ends with ${B}`}</span>
              </h1>
              <p className="mt-2.5 mb-0 text-[15px] font-semibold text-muted-foreground">
                {`At least ${ctx.minWordLength} letters. Get ready to type.`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
