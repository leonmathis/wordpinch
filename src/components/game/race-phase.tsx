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

// Hoisted: avoid re-creating the regex on every onChange / submit.
const NON_ALPHA_REGEX = /[^A-Z]/g;

function useRaceTimer(total: number, onExpire?: () => void) {
  const [left, setLeft] = React.useState(total);
  const onExpireRef = React.useRef(onExpire);

  // Track latest onExpire without re-running the interval each render. Setting
  // a ref during render IS what react-hooks/refs forbids; we update inside an
  // effect so React's commit phase has run first.
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });

  React.useEffect(() => {
    setTimeout(() => setLeft(total), 0);
    let fired = false;
    const i = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (!fired) {
            fired = true;
            clearInterval(i);
            onExpireRef.current?.();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [total]);

  return left;
}

export function RacePhase({ ctx }: { ctx: GameCtx }) {
  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  // Number of underscores between A and B = minWordLength - 2 (first + last
  // letter are the bracket). Drives both the pinned template and the input
  // placeholder so the minimum is visible at a glance.
  const gaps = Math.max(0, ctx.minWordLength - 2);
  const [val, setVal] = React.useState(A);
  const [reject, setReject] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Lazy useState — computed exactly once on mount. Combined with
  // key={sceneKey} on RacePhase (in WordpinchUI), this re-derives the
  // remaining time on every fresh entry to the race phase, including a
  // page refresh mid-round.
  const [initialLeft] = React.useState(() => {
    const total = ctx.roundTimerSec || 60;
    if (!ctx.raceStartedAt) return total;
    const elapsed = Math.floor((Date.now() - ctx.raceStartedAt) / 1000);
    return Math.max(0, total - elapsed);
  });

  const left = useRaceTimer(initialLeft, () => {
    // Host-gated: only the referee can declare a timeout. Guest fires the
    // same callback but no-ops; they'll receive the result via broadcast.
    if (ctx.actions.ready && ctx.meIsHost) void ctx.actions.timeoutRound();
  });
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
    rejectTimerRef.current = setTimeout(() => {
      setReject(false);
      // Refocus so the user can keep typing without clicking back in. The
      // readOnly-during-submit already preserves focus on the API reject
      // path; this catches the format-reject path and any browser quirks.
      inputRef.current?.focus();
    }, 220);
  }, []);

  React.useEffect(() => {
    if (ctx.simulateReject) triggerReject();
  }, [ctx.simulateReject, triggerReject]);

  React.useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(NON_ALPHA_REGEX, "");
    setVal(cleaned.startsWith(A) ? cleaned : A + cleaned);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const lower = val.toLowerCase();
    // Local format checks — short-circuit before hitting the API. Honor:
    //  - minimum word length (settings)
    //  - start/end letter constraint
    //  - no-repeat (always; reject words already used this match)
    const alreadyUsed = ctx.used.some(
      (u) => u.word.toLowerCase() === lower
    );
    if (
      val.length < ctx.minWordLength ||
      !val.startsWith(A) ||
      !val.endsWith(B) ||
      alreadyUsed
    ) {
      triggerReject();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/words/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: lower,
          allowProperNouns: ctx.settings.allowProperNouns,
        }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        phonetic?: string;
        audio?: string;
        definitions?: { partOfSpeech: string; definition: string; example?: string }[];
      };
      if (!data.valid) {
        triggerReject();
        return;
      }
      if (ctx.actions.ready) {
        await ctx.actions.submitWord(lower, {
          phonetic: data.phonetic,
          audio: data.audio,
          definitions: data.definitions,
        });
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
            <LettersDisplay start={A} end={B} gaps={gaps} />
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
              placeholder={`${A}${"_".repeat(gaps)}${B}`}
              aria-label="Your word"
              // readOnly (not disabled) while submitting: keeps focus on the
              // input so the user can keep trying after a rejected word. The
              // form submit handler guards against double-submit via
              // `if (submitting) return`.
              readOnly={submitting}
            />
            <div
              className="race-progress"
              style={{ width: `${((ctx.roundTimerSec || 60) > 0 ? (left / (ctx.roundTimerSec || 60)) : 0) * 100}%` }}
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
            <div className="t-label">
              min {ctx.minWordLength} letters · Enter to submit
            </div>
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
