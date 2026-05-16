"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { LettersDisplay } from "./letters-display";
import { playBuzz } from "@/lib/sound";

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
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const left = useRaceTimer(20);
  const rejectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    },
    []
  );

  const triggerReject = React.useCallback(() => {
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    // setTimeout(0) keeps the setState async — required by
    // react-hooks/set-state-in-effect when triggerReject is called from an effect.
    setTimeout(() => setReject(true), 0);
    playBuzz();
    rejectTimerRef.current = setTimeout(() => setReject(false), 220);
  }, []);

  React.useEffect(() => {
    if (ctx.simulateReject) triggerReject();
  }, [ctx.simulateReject, triggerReject]);

  React.useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
    setVal(cleaned.startsWith(A) ? cleaned : A + cleaned);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const lower = val.toLowerCase();
    // Local format checks — short-circuit before hitting the API. These rules
    // match the room settings; once Phase 7 wires real settings in, replace
    // the constants with reads from ctx.settings.
    if (val.length < 3 || !val.startsWith(A) || !val.endsWith(B)) {
      triggerReject();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/words/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: lower }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        phonetic?: string;
      };
      if (!data.valid) {
        triggerReject();
        return;
      }
      if (ctx.actions.ready) {
        await ctx.actions.submitWord(lower, "host", data.phonetic);
      }
    } catch (err) {
      console.warn("[race] validation request failed", err);
      triggerReject();
    } finally {
      setSubmitting(false);
    }
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

          <form onSubmit={onSubmit} className="race-input-wrap">
            <Input
              ref={inputRef}
              className={`${RACE_INPUT_OVERRIDES} ${reject ? "shake flash-destructive" : ""}`}
              value={val}
              onChange={handle}
              placeholder={`${A}${"_".repeat(3)}${B}`}
              aria-label="Your word"
              disabled={submitting}
            />
            <div
              className="race-progress"
              style={{ width: `${(left / 20) * 100}%` }}
            />
          </form>

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
