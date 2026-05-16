"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { LettersDisplay } from "./letters-display";

const RACE_INPUT_OVERRIDES =
  "race-input rounded-[var(--radius)] h-[96px] max-[500px]:h-[80px] w-full px-4 py-0 text-[48px] max-[500px]:text-[36px] md:text-[48px] bg-transparent dark:bg-transparent focus-visible:ring-0";

function useRaceTimer(total = 20) {
  const [left, setLeft] = React.useState(total);
  React.useEffect(() => {
    const i = setInterval(
      () => setLeft((s) => (s > 0 ? s - 1 : 0)),
      1000
    );
    return () => clearInterval(i);
  }, []);
  return left;
}

export function RacePhase({ ctx }: { ctx: GameCtx }) {
  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  const [val, setVal] = React.useState(A);
  const [reject, setReject] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const left = useRaceTimer(20);

  React.useEffect(() => {
    if (!ctx.simulateReject) return;
    const start = setTimeout(() => setReject(true), 0);
    const end = setTimeout(() => setReject(false), 220);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [ctx.simulateReject]);

  React.useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
    setVal(cleaned.startsWith(A) ? cleaned : A + cleaned);
  };

  return (
    <>
      <TopChrome
        round={ctx.round}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
      />
      <div className="wp-body" style={{ paddingTop: 56 }}>
        <div className="wp-frame scene">
          <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
            <LettersDisplay start={A} end={B} />
            <div
              className="font-mono tabular-nums"
              style={{
                fontSize: 24,
                color: left <= 5 ? "var(--destructive)" : "var(--foreground)",
              }}
            >
              {String(left).padStart(2, "0")}s
            </div>
          </div>

          <div className="race-input-wrap">
            <Input
              ref={inputRef}
              className={`${RACE_INPUT_OVERRIDES} ${reject ? "shake flash-destructive" : ""}`}
              value={val}
              onChange={handle}
              placeholder={`${A}${"_".repeat(3)}${B}`}
              aria-label="Your word"
            />
            <div
              className="race-progress"
              style={{ width: `${(left / 20) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <div className="t-label flex items-center" style={{ gap: 8 }}>
              <span
                className="wp-dot pulse-soft"
                style={{ background: "var(--muted-foreground)" }}
              />
              <span>{ctx.them.name} is typing</span>
            </div>
            <div className="t-label">Press Enter to submit</div>
          </div>

          <ScoreHud
            you={ctx.you}
            them={ctx.them}
            used={ctx.used.slice(0, ctx.round - 1)}
          />
        </div>
      </div>
    </>
  );
}
