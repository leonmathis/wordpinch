"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { LettersDisplay } from "./letters-display";
import { OpponentAwayBanner } from "./opponent-away";
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
    // Re-seed on `total` change. The zero-delay setTimeout defers the
    // setState past the effect body to satisfy react-hooks/set-state-in-effect;
    // it's also cleaned up so a fast unmount within the same tick can't
    // setState on an unmounted component.
    const seed = setTimeout(() => setLeft(total), 0);
    const i = setInterval(() => {
      // Hold the clock while the opponent's gone — the timer resumes when
      // presence sees them again. The 10 s grace timer runs in parallel
      // and forfeits the round if they stay missing.
      if (pausedRef.current) return;
      // Pure updater. This used to end the round from *inside* the
      // updater (clearing the interval and POSTing the timeout), which
      // React is free to run more than once — so the round could be
      // declared twice, or skipped because the guard flag had already
      // been flipped by a discarded invocation.
      setLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      clearTimeout(seed);
      clearInterval(i);
    };
  }, [total]);

  // Expiry lives in its own effect, driven by the committed value, so it
  // fires exactly once per mount no matter how the updater was invoked.
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (left > 0 || firedRef.current) return;
    firedRef.current = true;
    onExpireRef.current?.();
  }, [left]);

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
  const [rejectMessage, setRejectMessage] = React.useState<string | null>(null);
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

  // `actionsRef` keeps the latest actions reachable from callbacks
  // without listing `ctx.actions` in deps — that identity changes on
  // every broadcast and would otherwise restart the 10s grace timer.
  const actionsRef = React.useRef(ctx.actions);
  React.useEffect(() => {
    actionsRef.current = ctx.actions;
  });

  const paused = !ctx.opponentOnline;
  // `refereeRef` mirrors ctx.meIsReferee so the timer callback (armed once)
  // sees the current value — the guest can acquire the role mid-round.
  const refereeRef = React.useRef(ctx.meIsReferee);
  React.useEffect(() => {
    refereeRef.current = ctx.meIsReferee;
  });
  const left = useRaceTimer(initialLeft, paused, () => {
    // Referee-gated: only one client declares the timeout. The other fires
    // the same callback but no-ops; they receive the result via broadcast.
    const a = actionsRef.current;
    if (a.ready && refereeRef.current) void a.timeoutRound();
  });

  // One-shot urgency pulse the moment the clock crosses from 6 → 5.
  // `prevLeftRef` keeps the comparison stable across renders so the
  // pulse doesn't replay if React re-renders mid-second; `onAnimationEnd`
  // clears the class so the CSS animation only fires once per round.
  const [timerPulse, setTimerPulse] = React.useState(false);
  const prevLeftRef = React.useRef(left);
  React.useEffect(() => {
    if (prevLeftRef.current > 5 && left === 5) setTimerPulse(true);
    prevLeftRef.current = left;
  }, [left]);

  // The 10 s grace period + forfeit now live in <OpponentAwayBanner>, which
  // mounts for whichever player is still here and is shared with the pick
  // and reveal phases.
  const rejectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    },
    []
  );

  /**
   * Reject the current attempt and say why.
   *
   * The shake + buzz alone were the *entire* feedback for five different
   * failures (too short, wrong letters, already played, not a word, network
   * error), which left players guessing — and the reduced-motion + muted
   * combination left them with almost nothing at all. The message persists
   * until the next keystroke and is announced via a live region.
   */
  const triggerReject = React.useCallback((message: string) => {
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    // setTimeout(0) keeps the setState async — required by
    // react-hooks/set-state-in-effect when triggerReject is called from an effect.
    setTimeout(() => {
      setReject(true);
      setRejectMessage(message);
    }, 0);
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
    if (rejectMessage) setRejectMessage(null);
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
    if (val.length < ctx.minWordLength) {
      triggerReject(
        `Too short — needs at least ${ctx.minWordLength} letters.`
      );
      return;
    }
    if (!val.startsWith(A)) {
      triggerReject(`Has to start with ${A}.`);
      return;
    }
    if (!val.endsWith(B)) {
      triggerReject(`Has to end with ${B}.`);
      return;
    }
    if (alreadyUsed) {
      triggerReject(`${val} has already been played this match.`);
      return;
    }
    setSubmitting(true);
    // `submitInFlight` (the parent's "show settling overlay" signal) is
    // *not* set here — only the local `submitting` flag, which flips the
    // button text to "Submitting…" without leaving the race phase. We
    // raise `submitInFlight` only AFTER the dictionary `/validate` has
    // returned a valid word; otherwise a rejected word would flash the
    // settling overlay in and out, which reads as a layout glitch.
    let raisedInFlight = false;
    try {
      const res = await fetch("/api/words/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: lower,
          allowProperNouns: ctx.settings.allowProperNouns,
        }),
      });
      if (!res.ok) {
        // 429 / 500 from our own API — not the player's fault, and telling
        // them "not a word" here would be a lie.
        triggerReject(
          res.status === 429
            ? "Checking too fast — wait a second and submit again."
            : "Couldn't check that word — try again."
        );
        return;
      }
      const data = (await res.json()) as {
        valid?: boolean;
        phonetic?: string;
        audio?: string;
        definitions?: { partOfSpeech: string; definition: string; example?: string }[];
      };
      if (!data.valid) {
        // Loose mode checks the dictionary API *and* the game word list, so
        // naming only the dictionary would misdescribe the rejection — and
        // read as a lie for the words the API simply doesn't index.
        triggerReject(
          ctx.settings.allowProperNouns
            ? `${val} isn't a word we know.`
            : `${val} isn't in the word list. Proper nouns and slang are off for this match.`
        );
        return;
      }
      // Word is real — commit to the settling overlay before posting
      // to `/submit`, so the result phase mounts via the settling
      // crossfade instead of a race→result jump.
      ctx.setSubmitInFlight(true);
      raisedInFlight = true;
      if (ctx.actions.ready) {
        await ctx.actions.submitWord(lower, {
          phonetic: data.phonetic,
          audio: data.audio,
          definitions: data.definitions,
        });
      }
    } catch (err) {
      console.warn("[race] validation request failed", err);
      triggerReject("Connection problem — your word wasn't checked. Try again.");
    } finally {
      setSubmitting(false);
      if (raisedInFlight) ctx.setSubmitInFlight(false);
    }
  };

  // Tap-anywhere-to-focus: mobile browsers refuse programmatic focus
  // outside a user gesture, so the auto-focus useEffect above only opens
  // the keyboard on desktop. Making the surrounding frame tappable means
  // *any* tap (the input itself, the letters template, blank space)
  // counts as the user gesture that opens the keyboard.
  const focusInput = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    // Already focused? Don't jump the caret — the user might have
    // tapped mid-word to position it intentionally.
    if (typeof document !== "undefined" && document.activeElement === el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* unsupported on some virtual keyboards — non-fatal */
    }
  }, []);

  return (
    <>
      <div className="wp-body" style={{ paddingTop: 56 }}>
        {/* `role="presentation"`: the tap handler is a touch convenience
         *  (tapping blank space opens the keyboard), not an interactive
         *  control. Keyboard and screen-reader users reach the input
         *  directly — it autofocuses on mount and is the first tab stop —
         *  so this element must not announce itself as clickable. */}
        <div
          className="wp-frame scene"
          role="presentation"
          onClick={focusInput}
        >
          {paused ? <OpponentAwayBanner ctx={ctx} /> : null}
          <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
            <LettersDisplay start={A} end={B} gaps={gaps} />
            <div
              className={`font-mono tabular-nums ${timerPulse ? "timer-pulse" : ""}`}
              onAnimationEnd={() => setTimerPulse(false)}
              style={{
                fontSize: 24,
                color: left <= 5 ? "var(--destructive)" : "var(--foreground)",
              }}
            >
              {String(left).padStart(2, "0")}s
            </div>
          </div>

          <form onSubmit={onSubmit}>
            {/* The <label> wrapping the input is the *primary* mobile
             *  focus mechanism: tapping anywhere on the label (the big
             *  96px hit area, including the progress strip at the bottom)
             *  natively focuses the inner <input>, which counts as the
             *  user gesture iOS/Android need to open the on-screen
             *  keyboard. The wp-frame onClick (above) is a fallback for
             *  taps outside this area. */}
            <label className="race-input-wrap block cursor-text">
              <Input
                ref={inputRef}
                autoFocus
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
            </label>
            <Button
              type="submit"
              disabled={submitting || val.length < ctx.minWordLength}
              className="h-[38px] w-full rounded-[var(--radius)] text-[14px] font-medium mt-3"
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
            {/* Always rendered so the live region exists before the first
             *  rejection — screen readers ignore regions inserted at the
             *  same moment their content appears. */}
            <div
              role="status"
              aria-live="polite"
              className="t-label text-center mt-2 min-h-[18px]"
              style={rejectMessage ? { color: "var(--destructive)" } : undefined}
            >
              {rejectMessage ?? ""}
            </div>
          </form>

          <div
            className="flex items-center justify-between gap-3"
            style={{ marginTop: 14 }}
          >
            {/* LEFT — opponent indicator, always about the OTHER player.
             *  Doesn't change when the local player submits (was a bug
             *  to flip it: same row reading "Submitted" alongside the
             *  opponent's avatar looked like the opponent had
             *  submitted). `min-w-0` + `truncate` lets long names
             *  ellipsize instead of pushing the row to two lines.
             *
             *  It used to read "<name> is typing" unconditionally — a
             *  claim the app has no signal for, and one that kept
             *  showing while the banner above said the same player had
             *  disconnected. Now it reports only what we actually know:
             *  presence, and whether their word has reached the server. */}
            <div
              className="t-label flex items-center min-w-0"
              style={{ gap: 8 }}
            >
              <Avatar
                name={ctx.them.name}
                size={18}
                dim={paused}
                side={ctx.mySide === "host" ? "guest" : "host"}
              />
              <span className="truncate">
                {paused
                  ? `${ctx.them.name} is offline`
                  : ctx.opponentSubmitted
                  ? `${ctx.them.name} submitted`
                  : `${ctx.them.name} is in the round`}
              </span>
              {ctx.opponentSubmitted && !paused ? (
                <Check
                  strokeWidth={2}
                  className="size-[13px] shrink-0"
                  aria-hidden
                />
              ) : (
                <span
                  className={`wp-dot shrink-0 ${paused ? "" : "pulse-soft"}`}
                  style={{
                    background: paused
                      ? "var(--muted-soft)"
                      : "var(--muted-foreground)",
                  }}
                />
              )}
            </div>
            {/* RIGHT — local-side hint. Hidden on narrow viewports
             *  where the "Enter to submit" affordance doesn't apply
             *  anyway (touch users tap the button) and the row would
             *  otherwise wrap to two lines next to the opponent
             *  indicator. The submit button's own label flips to
             *  "Submitting…" while the request is in flight, so
             *  there's no lost feedback. */}
            <div className="t-label hidden sm:block text-right">
              {submitting
                ? "Checking your word…"
                : `min ${ctx.minWordLength} letters · Enter to submit`}
            </div>
          </div>

          <ScoreHud
            you={ctx.you}
            them={ctx.them}
            used={ctx.used.filter((u) => u.round < ctx.round)}
          />
        </div>
      </div>
    </>
  );
}
