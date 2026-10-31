"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LetterSlots } from "./kit/letter-slots";
import { OpponentAwayBanner } from "./opponent-away";
import { Avatar } from "./avatar";
import { playBuzz } from "@/lib/sound";
import { PLAYER_REACTIONS } from "@/lib/room-fx";
import { ReactionBubble, ReactionPills } from "./reactions";
import { lockedWordInput } from "@/lib/game/word-input";

/** "45" under a minute, "1:30" from 60 s. */
function formatClock(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s);
}

/** Input type steps down as the word grows, so 19 letters still fit. */
function inputFont(length: number) {
  if (length <= 10) return "text-2xl lg:text-[30px]";
  if (length <= 14) return "text-xl lg:text-[26px]";
  return "text-[17px] lg:text-[22px]";
}

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
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      /* unsupported on some virtual keyboards — non-fatal */
    }
  }, []);

  // Set by `handle` when it moved letters; applied once React has written
  // the new value (which puts the caret at the end).
  const caretAfterRef = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    const at = caretAfterRef.current;
    const el = inputRef.current;
    if (at === null || !el) return;
    caretAfterRef.current = null;
    try {
      el.setSelectionRange(at, at);
    } catch {
      /* unsupported on some virtual keyboards — non-fatal */
    }
  }, [val]);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: next, caret } = lockedWordInput(e.target.value, val, A);
    if (caret !== null) caretAfterRef.current = caret;
    setVal(next);
    // F3: the opponent sees how many letters, never which.
    ctx.fx.typing(next.length);
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
        `Too short, needs at least ${ctx.minWordLength} letters.`
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
            ? "Checking too fast, wait a second and try again."
            : "Couldn't check that word, try again."
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
            : `${val} isn't in the word list. Slang and proper nouns are off.`
        );
        return;
      }
      // Word is real — commit to the settling overlay before posting
      // to `/submit`, so the result phase mounts via the settling
      // crossfade instead of a race→result jump.
      ctx.setSubmitInFlight(true, lower);
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
      triggerReject("Connection problem, your word wasn't checked. Try again.");
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

  // F4 peek. A reload in the round it was spent asks again: the server
  // returns the same letter without spending anything.
  const [peeked, setPeeked] = React.useState<string | null>(null);
  const [peekState, setPeekState] = React.useState<"idle" | "busy" | "none">("idle");
  const spentEarlier = ctx.peek.spentRound !== null && ctx.peek.spentRound !== ctx.round;
  const spentNow = ctx.peek.spentRound === ctx.round;
  const peekRef = React.useRef(ctx.actions.peek);
  React.useEffect(() => {
    peekRef.current = ctx.actions.peek;
  });
  const actionsReady = ctx.actions.ready;
  React.useEffect(() => {
    if (!spentNow || !actionsReady) return;
    let cancelled = false;
    void peekRef.current().then((r) => {
      if (!cancelled && "letter" in r) setPeeked(r.letter);
    });
    return () => {
      cancelled = true;
    };
  }, [spentNow, actionsReady]);
  const doPeek = async () => {
    if (peekState === "busy" || peeked || spentEarlier) return;
    if (!ctx.actions.ready) {
      // Design preview: no room, so the artboard's "O" stands in.
      setPeeked("O");
      return;
    }
    setPeekState("busy");
    const r = await ctx.actions.peek();
    if ("letter" in r) {
      setPeeked(r.letter);
      setPeekState("idle");
    } else setPeekState(r.error === "no_word" ? "none" : "idle");
  };
  const peekUsed = !!peeked || spentEarlier || (ctx.collection.preview && spentNow);

  const urgent = left <= 5 && !paused;
  // The prefilled first letter alone ("1 letter") says nothing.
  const opponentLen = ctx.mySide ? ctx.fx.lens[ctx.mySide === "host" ? "guest" : "host"] : null;
  const message = rejectMessage ?? (submitting ? "Checking your word…" : `min ${ctx.minWordLength} letters · Enter to submit`);

  return (
    <div className="wp-body">
      {/* `role="presentation"`: the tap handler is a touch convenience
       *  (tapping blank space opens the keyboard), not an interactive
       *  control. Keyboard and screen-reader users reach the input
       *  directly — it autofocuses on mount and is the first tab stop —
       *  so this element must not announce itself as clickable.
       *  Top-aligned (not centred like other phases): on phones the system
       *  keyboard takes the bottom ~290px, and everything here must sit
       *  above it. */}
      <div
        className="wp-frame mt-0 mb-auto gap-3.5 lg:my-auto lg:max-w-[720px] lg:gap-7"
        role="presentation"
        onClick={focusInput}
      >
        {paused ? <OpponentAwayBanner ctx={ctx} className="mb-0" /> : null}

        <div className="flex items-center justify-between gap-2.5">
          <LetterSlots first={A} last={B} peek={peeked} size={84} className="justify-start gap-2 lg:hidden" />
          <LetterSlots first={A} last={B} peek={peeked} size={132} className="hidden justify-start gap-[18px] lg:flex" />
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div
              role="timer"
              aria-label={paused ? `Timer paused at ${left} seconds` : `${left} seconds left`}
              className={cn(
                "flex size-16 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums lg:size-24 lg:text-[34px]",
                paused
                  ? "bg-card text-card-foreground"
                  : urgent
                    ? "bg-shape-magenta text-white"
                    : "bg-shape-yellow text-[#141414]",
                timerPulse && "timer-pulse"
              )}
              onAnimationEnd={() => setTimerPulse(false)}
            >
              {formatClock(left)}
            </div>
            <span aria-hidden className={cn("text-xs font-bold", urgent ? "text-attention" : "text-muted-foreground")}>
              {paused ? "paused" : urgent ? "hurry!" : left >= 60 ? "left" : "seconds"}
            </span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Input
              ref={inputRef}
              autoFocus
              variant="pill"
              className={cn(
                "h-[58px] min-w-0 flex-1 px-[22px] font-extrabold tracking-[1px] lg:h-[72px]",
                inputFont(val.length),
                reject && "shake"
              )}
              value={val}
              onChange={handle}
              placeholder={`${A}${"_".repeat(gaps)}${B}`}
              aria-label={`Your word, starting with ${A} and ending with ${B}`}
              aria-describedby="race-message"
              aria-invalid={rejectMessage ? true : undefined}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              // readOnly (not disabled) while submitting: keeps focus on the
              // input so the user can keep trying after a rejected word. The
              // form submit handler guards against double-submit via
              // `if (submitting) return`.
              readOnly={submitting}
            />
            <Button
              type="submit"
              variant="pill"
              className="size-[58px] shrink-0 p-0 lg:size-[72px] [&_svg:not([class*='size-'])]:size-[22px]"
              disabled={submitting}
              aria-label={submitting ? "Checking your word" : "Submit word"}
            >
              {submitting ? (
                <span aria-hidden className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <ArrowRight strokeWidth={2.4} />
              )}
            </Button>
          </div>
          {/* Always rendered so the live region exists before the first
           *  rejection — screen readers ignore regions inserted at the
           *  same moment their content appears. */}
          <div
            id="race-message"
            role="status"
            aria-live="polite"
            className={cn(
              "min-h-[22px] px-[22px] text-sm font-bold",
              rejectMessage ? "text-attention" : "text-muted-foreground"
            )}
          >
            {message}
          </div>
        </form>

        {/* Always about the OTHER player, and only what we actually know:
         *  presence, and whether their word has reached the server (it
         *  used to claim "is typing", which the app has no signal for). */}
        <div className="relative flex min-w-0 items-center gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5">
          <ReactionBubble ctx={ctx} className="-top-9 left-[34px]" hidden={!!rejectMessage} />
          <Avatar
            name={ctx.them.name}
            size={36}
            dim={paused}
            side={ctx.mySide === "host" ? "guest" : "host"}
          />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {paused
              ? `${ctx.them.name} is offline`
              : ctx.opponentSubmitted
                ? `${ctx.them.name} submitted a word`
                : `${ctx.them.name} is in the round`}
          </span>
          {ctx.opponentSubmitted && !paused ? (
            <span className="shrink-0 text-sm font-bold text-muted-foreground">checking…</span>
          ) : !paused && opponentLen !== null && opponentLen > 1 ? (
            <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">{`${opponentLen} letters`}</span>
          ) : null}
        </div>

        {/* One row above the phone keyboard: with peek on, four pills are
         *  wider than a phone, so the row scrolls sideways (peek first, so
         *  it never hides) instead of wrapping under the keyboard. */}
        <div
          data-race-actions
          data-scroll-x
          className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {ctx.peek.on ? (
            <Button
              type="button"
              variant="pill-soft"
              size="pill-md"
              className={cn(
                "shrink-0 font-bold",
                peekUsed || peekState === "none" ? "" : "bg-shape-yellow text-[#141414] hover:bg-shape-yellow/85"
              )}
              disabled={peekUsed || peekState === "none"}
              aria-busy={peekState === "busy" || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                void doPeek();
              }}
            >
              {peekUsed ? "Peek used" : peekState === "none" ? "No hint this round" : peekState === "busy" ? "Peeking…" : "Peek a letter · 1"}
            </Button>
          ) : null}
          <ReactionPills ctx={ctx} ids={PLAYER_REACTIONS} label="Reactions" className="flex-nowrap lg:flex-wrap" />
        </div>
      </div>
    </div>
  );
}
