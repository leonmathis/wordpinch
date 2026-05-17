"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import { LettersDisplay } from "./letters-display";
import { Avatar } from "./avatar";
import { playBuzz } from "@/lib/sound";

const RACE_INPUT_OVERRIDES =
  "race-input rounded-[var(--radius)] h-[96px] max-[500px]:h-[80px] w-full px-4 py-0 text-[48px] max-[500px]:text-[36px] md:text-[48px] bg-transparent dark:bg-transparent focus-visible:ring-0";

// Hoisted: avoid re-creating the regex on every onChange / submit.
const NON_ALPHA_REGEX = /[^A-Z]/g;

function useRaceTimer(
  total: number,
  paused: boolean,
  onExpire?: () => void
) {
  const [left, setLeft] = React.useState(total);
  const onExpireRef = React.useRef(onExpire);
  const pausedRef = React.useRef(paused);

  // Track latest values without re-running the interval each render. Refs
  // are mutated in an effect (not during render) to keep
  // react-hooks/refs happy.
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });
  React.useEffect(() => {
    pausedRef.current = paused;
  });

  React.useEffect(() => {
    setTimeout(() => setLeft(total), 0);
    let fired = false;
    const i = setInterval(() => {
      // Hold the clock while the opponent's gone — the timer resumes when
      // presence sees them again. The 10 s grace timer runs in parallel
      // and forfeits the round if they stay missing.
      if (pausedRef.current) return;
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

/**
 * Grace period (ms) after the opponent disconnects before the host's client
 * forfeits the round in favour of the player still here.
 */
const FORFEIT_GRACE_MS = 10_000;

function DisconnectBanner({ opponentName }: { opponentName: string }) {
  const [secondsLeft, setSecondsLeft] = React.useState(
    Math.ceil(FORFEIT_GRACE_MS / 1000)
  );
  React.useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(
        0,
        Math.ceil((FORFEIT_GRACE_MS - elapsed) / 1000)
      );
      setSecondsLeft(remaining);
    };
    tick();
    const i = setInterval(tick, 250);
    return () => clearInterval(i);
  }, []);
  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert />
      <AlertDescription className="font-mono text-[13px]">
        {opponentName} disconnected · forfeits in{" "}
        <span className="tabular-nums">{secondsLeft}s</span>
      </AlertDescription>
    </Alert>
  );
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

  const paused = !ctx.opponentOnline;
  const left = useRaceTimer(initialLeft, paused, () => {
    // Host-gated: only the referee can declare a timeout. Guest fires the
    // same callback but no-ops; they'll receive the result via broadcast.
    if (ctx.actions.ready && ctx.meIsHost) void ctx.actions.timeoutRound();
  });

  // 10 s grace period: if the opponent stays disconnected, the host's
  // client awards the round to the player still here. Guests don't run
  // this — they're either the disappearing player (no client to fire)
  // or they're the one still here (waiting for host's call).
  React.useEffect(() => {
    if (!ctx.meIsHost) return;
    if (ctx.opponentOnline) return;
    if (!ctx.actions.ready) return;
    const t = setTimeout(() => {
      // Forfeit the round to the local player (host). The action itself
      // re-checks state.phase / pendingResult to avoid clobbering an
      // in-flight resolver.
      if (ctx.actions.ready) void ctx.actions.forfeitRound("host");
    }, FORFEIT_GRACE_MS);
    return () => clearTimeout(t);
  }, [ctx.meIsHost, ctx.opponentOnline, ctx.actions]);
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
      <div className="wp-body" style={{ paddingTop: 56 }}>
        <div className="wp-frame scene">
          {paused ? <DisconnectBanner opponentName={ctx.them.name} /> : null}
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
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
            <Button
              type="submit"
              disabled={submitting || val.length < ctx.minWordLength}
              className="h-[38px] w-full rounded-[var(--radius)] text-[14px] font-medium mt-3"
            >
              Submit
            </Button>
          </form>

          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <div className="t-label flex items-center" style={{ gap: 8 }}>
              <Avatar name={ctx.them.name} size={18} />
              <span>{ctx.them.name} is typing</span>
              <span
                className="wp-dot pulse-soft"
                style={{ background: "var(--muted-foreground)" }}
              />
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
