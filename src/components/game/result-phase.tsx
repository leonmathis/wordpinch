"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Equal, LogOut, Play, RotateCcw, type LucideIcon } from "lucide-react";
import { playDing } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";
import { Avatar } from "./avatar";
import { AnchoredWord } from "./kit/anchored-word";
import { Shape } from "./kit/shape";

type SuggestResponse = {
  suggestions: string[];
};

/**
 * Rendered only if the API result went missing — never in normal play, but
 * it keeps the definitions block from collapsing to nothing. Module scope so
 * the array identity is stable across renders.
 */
const FALLBACK_DEFS = [
  {
    partOfSpeech: "noun",
    definition: "No definition available.",
    example: undefined,
  },
];

/** Empty-state hero: an icon in a flower beside a two-line headline. */
function Hero({ icon: Icon, fill, a, b }: { icon: LucideIcon; fill: string; a: string; b: string }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <Shape kind="flower" size={120} fill={fill}>
        <Icon aria-hidden className="size-10" strokeWidth={2} />
      </Shape>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className="text-[30px] leading-none font-extrabold">{a}</div>
        <div className="font-hand text-[30px] leading-[1.1]">{b}</div>
      </div>
    </div>
  );
}

/** "2.40 s" from the race start, when the room has one. */
function raceTime(submittedAt: number, raceStartedAt?: number) {
  return raceStartedAt ? `${((submittedAt - raceStartedAt) / 1000).toFixed(2)} s` : null;
}

function speakFallback(word: string) {
  if (!word || typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return;
  try {
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(word.toLowerCase());
    utt.rate = 0.9;
    utt.pitch = 1;
    synth.speak(utt);
  } catch {
    /* ignore */
  }
}

export function ResultPhase({ ctx }: { ctx: GameCtx }) {
  const [showDelta, setShowDelta] = React.useState(false);
  // null = still loading, [] = loaded with no matching words, [w…] = words.
  const [suggestions, setSuggestions] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    playDing();
    // Browsers block vibrate() before the page has had a tap and log an
    // intervention error for it; only buzz once the player has interacted.
    try {
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setShowDelta(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Auto-advance after the 5s advance-bar fill completes. The guest's
  // nextRound is a no-op (action is host-gated client-side too), so only
  // the host's POST drives the transition.
  //
  // `actionsRef` keeps the latest actions object reachable from the
  // setTimeout callback without listing `ctx.actions` as a dep — that
  // ref-identity changes whenever the broadcast lands, which would reset
  // the 5s timer mid-countdown.
  const actionsRef = React.useRef(ctx.actions);
  const refereeRef = React.useRef(ctx.meIsReferee);
  React.useEffect(() => {
    actionsRef.current = ctx.actions;
    refereeRef.current = ctx.meIsReferee;
  });
  // The auto-advance is shorter for replay_pending (just enough to read
  // both attempts) and fires `replayRound` instead of `nextRound`. Same
  // applies when the round timed out with tieBehavior='replay' — neither
  // player submitted, the round re-runs after a brief look at the
  // suggested-words screen.
  const isTimeoutReplay =
    ctx.resultReason === "timeout" && ctx.settings.tieBehavior === "replay";
  const fireReplay = ctx.resultReason === "replay_pending" || isTimeoutReplay;
  const advanceMs = fireReplay ? 4200 : 5200;
  // Holding the result screen: while the referee's pointer or keyboard
  // focus is inside the frame, the countdown stops so they can finish
  // reading the definition. Only the referee's client drives the actual
  // transition, so only their hold is honoured — pausing the bar on a
  // non-referee's screen would promise something it can't deliver.
  const [held, setHeld] = React.useState(false);
  const heldRef = React.useRef(false);
  React.useEffect(() => {
    heldRef.current = held;
  });
  const canHold = ctx.meIsReferee;
  const hold = React.useCallback(() => setHeld(true), []);
  const release = React.useCallback(() => setHeld(false), []);

  React.useEffect(() => {
    let cancelled = false;
    let elapsed = 0;
    let lastAttempt = 0;
    const STEP_MS = 100;
    const RETRY_MS = 2500;
    // Retried while this phase is mounted: the referee role can move to the
    // guest a few seconds in (host closed their tab), and without a retry
    // the result screen was a terminal state — advance bar drained, nothing
    // ever happened, no way out.
    const tick = () => {
      if (cancelled) return;
      if (!heldRef.current) elapsed += STEP_MS;
      if (elapsed < advanceMs) return;
      if (lastAttempt && elapsed - lastAttempt < RETRY_MS) return;
      lastAttempt = elapsed;
      const a = actionsRef.current;
      if (!a.ready || !refereeRef.current) return;
      if (fireReplay) void a.replayRound();
      else void a.nextRound();
    };
    const id = setInterval(tick, STEP_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [advanceMs, fireReplay]);

  // A round can end via six shapes:
  //   1. Single winner    — winner = 'host' | 'guest', word + IPA + defs set
  //   2. Sim tie (split)  — winner = 'split', both submitted, both in
  //                         usedWords, result.attempts populated
  //   3. Sim tie (nobody) — winner = 'none', reason = 'tied_nobody'
  //   4. Timeout          — reason = 'timeout', winner reflects tieBehavior
  //                         ('none' for nobody, 'split' for split;
  //                         replay-config goes via 'replay_pending' below)
  //   5. Forfeit          — reason = 'forfeit', winner = 'host'|'guest',
  //                         no word played (opponent stayed disconnected)
  //   6. Replay pending   — reason = 'replay_pending', sim tie +
  //                         tieBehavior=replay. Both words shown via
  //                         result.attempts; host's client fires
  //                         replayRound after the countdown.
  const isTimeout = ctx.resultReason === "timeout";
  const isForfeit = ctx.resultReason === "forfeit";
  const isReplayPending = ctx.resultReason === "replay_pending";
  const isNone = ctx.winner === "none";
  const isSplit = ctx.winner === "split";
  const isSingleWinner = ctx.winner === "host" || ctx.winner === "guest";
  // For score-row +1 floats: replay_pending uses winner='split' for the
  // "both" framing but doesn't actually award points, so exclude it.
  const isScoredSplit = isSplit && !isReplayPending;
  const sideBySideAttempts = ctx.resultAttempts ?? [];
  // Near-miss: a solo winner with 2 attempts in result.attempts means
  // the loser submitted shortly after the resolver committed. Show the
  // pair with a "won by N ms" diff. Excludes the forfeit case (no real
  // race) and the timeout case (no submissions to compare).
  const isNearMiss =
    isSingleWinner &&
    !isForfeit &&
    !isTimeout &&
    sideBySideAttempts.length >= 2;
  const nearMissDiffMs = isNearMiss
    ? sideBySideAttempts[1].submittedAt - sideBySideAttempts[0].submittedAt
    : 0;
  // Side-by-side renders for sim ties AND near-misses.
  const hasSideBySide = sideBySideAttempts.length >= 2 && (isSplit || isNearMiss);

  // Fetch suggestions for every result that ended this round — win,
  // lose, draw, timeout — so both players always see a handful of
  // alternative words that would have worked. The one exception is
  // `replay_pending`, where the same letters are about to come back
  // around and the suggestions would just spoil the retry.
  const shouldFetchSuggestions = !isReplayPending;
  React.useEffect(() => {
    if (!shouldFetchSuggestions) return;
    const start = ctx.letterStart?.toLowerCase();
    const end = ctx.letterEnd?.toLowerCase();
    if (!start || !end) return;
    const params = new URLSearchParams({
      start,
      end,
      min: String(ctx.minWordLength),
    });
    let cancelled = false;
    fetch(`/api/words/suggest?${params}`)
      .then((r) => (r.ok ? (r.json() as Promise<SuggestResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        // [] = loaded but no matches (legit terminal state).
        setSuggestions(data?.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchSuggestions, ctx.letterStart, ctx.letterEnd, ctx.minWordLength]);

  const playPronunciation = React.useCallback(() => {
    // The global mute toggle wins over the audio-definitions setting —
    // a muted player shouldn't hear pronunciations either. The manual
    // play button stays clickable so the user can opt in to a single
    // playback by clicking it (the button itself doesn't recheck mute,
    // by design — explicit user action overrides the global mute).
    if (ctx.muted) return;
    // 1. Prefer the dictionary API's audio file when available.
    if (ctx.audio) {
      try {
        const a = new Audio(ctx.audio);
        a.play().catch(() => speakFallback(ctx.word));
        return;
      } catch {
        /* fall through */
      }
    }
    // 2. Fallback to the browser's SpeechSynthesis engine.
    speakFallback(ctx.word);
  }, [ctx.audio, ctx.word, ctx.muted]);

  // Auto-play pronunciation when the "Audio definitions" setting is on. Tiny
  // delay so the round-win ding doesn't overlap with the pronunciation.
  React.useEffect(() => {
    if (isTimeout) return;
    if (!ctx.settings.audioDefinitions) return;
    if (ctx.muted) return; // mute trumps audio-definitions
    if (!ctx.word) return;
    const t = setTimeout(playPronunciation, 700);
    return () => clearTimeout(t);
  }, [
    isTimeout,
    ctx.settings.audioDefinitions,
    ctx.muted,
    ctx.word,
    playPronunciation,
  ]);

  const word = ctx.word;
  const defs = ctx.definitions.length > 0 ? ctx.definitions : FALLBACK_DEFS;
  const winnerName = ctx.winner === "host" ? ctx.hostName : ctx.guestName;
  const loserName = ctx.winner === "host" ? ctx.guestName : ctx.hostName;
  const iWon = ctx.winner === ctx.mySide;

  // Canonical names everywhere — the viewer-perspective ctx.you / ctx.them
  // flip would otherwise show the guest seeing host's name when *they*
  // (the guest) win.
  const title = isReplayPending
    ? `Tied round ${ctx.round}: replaying`
    : isForfeit
      ? `${winnerName} wins round ${ctx.round} by forfeit`
      : isNone && isTimeout
        ? `Round ${ctx.round}: out of time, neither scores`
        : isNone
          ? `Tied round ${ctx.round}: neither scores`
          : isSplit && isTimeout
            ? `Tied round ${ctx.round}: out of time, both score`
            : isSplit
              ? `Tied round ${ctx.round}: both score`
              : isNearMiss
                ? `${winnerName} won round ${ctx.round} by ${nearMissDiffMs} ms`
                : `${winnerName} won round ${ctx.round}`;

  // Compute the score delta this round per side, mirroring the server-side
  // scoring math in `computeFinalState` / `recordNearMiss`. The delta drives
  // both the pre-increment value passed to <CountUp> and the "+N" badge, so
  // all three (final score, animation start, badge) stay consistent even
  // when the length-bonus setting kicks in (e.g. "+1.5" for a 6-letter solo
  // win at min=5).
  const meRole: "host" | "guest" = ctx.meIsHost ? "host" : "guest";
  const themRole: "host" | "guest" = ctx.meIsHost ? "guest" : "host";
  const bonusEnabled = ctx.settings.lengthBonus ?? false;
  const wordBonus = (w: string | undefined) => {
    if (!bonusEnabled || !w) return 0;
    const extra = w.length - ctx.minWordLength;
    return extra > 0 ? extra * 0.5 : 0;
  };
  const roundDelta = (side: "host" | "guest"): number => {
    if (isReplayPending) return 0;
    if (isForfeit) return ctx.winner === side ? 1 : 0;
    if (isTimeout) {
      // Timeout has no submissions to bonus; split awards 1 base to each,
      // otherwise nobody.
      return isSplit ? 1 : 0;
    }
    const attempt = ctx.resultAttempts?.find((a) => a.by === side);
    const bonus = wordBonus(attempt?.word);
    // Won outright OR sim-tie split (both score).
    if (ctx.winner === side || isScoredSplit) return 1 + bonus;
    // Tied-nobody with both submitted, or the near-miss loser: the bonus only.
    if (attempt) return bonus;
    return 0;
  };
  const scoreCards = [
    { side: meRole, name: ctx.you.name, score: ctx.you.score, delta: roundDelta(meRole), fill: "bg-shape-yellow" },
    { side: themRole, name: ctx.them.name, score: ctx.them.score, delta: roundDelta(themRole), fill: "bg-shape-pink" },
  ];

  const hero = isReplayPending
    ? { icon: RotateCcw, fill: "var(--shape-sage)", a: "One more go", b: "same letters, new race" }
    : isForfeit
      ? {
          icon: LogOut,
          fill: "var(--shape-pink)",
          a: `${loserName} left`,
          b: iWon ? "the point is yours" : `the point goes to ${winnerName}`,
        }
      : isTimeout
        ? { icon: Clock, fill: "var(--shape-yellow)", a: "Time's up!", b: isSplit ? "a point each, then" : "no point this round" }
        : isNone
          ? { icon: Equal, fill: "var(--shape-blue)", a: "Dead heat", b: "nobody gets the point" }
          : null;

  return (
    <div className="wp-body">
      <div
        className="wp-frame scene lg:max-w-[1040px]"
        onPointerEnter={canHold ? hold : undefined}
        onPointerLeave={canHold ? release : undefined}
        onFocusCapture={canHold ? hold : undefined}
        onBlurCapture={canHold ? release : undefined}
      >
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-x-12">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="self-start rounded-full bg-card px-3.5 py-2 text-sm font-bold [overflow-wrap:anywhere]">
              {title}
            </div>

            {hero ? (
              <Hero {...hero} />
            ) : hasSideBySide ? (
              <>
                {/* Sim tie or near-miss: both submissions side by side.
                 *  `slide-up-in` is reduced-motion guarded; the old
                 *  per-column stagger was not. */}
                <div className="slide-up-in grid grid-cols-2 gap-2.5">
                  {sideBySideAttempts.map((a, idx) => {
                    const playerName = a.by === "host" ? ctx.hostName : ctx.guestName;
                    // In a near-miss the first attempt is the winner. The
                    // loser's card steps back with a lighter fill, not with
                    // opacity, so its text keeps full contrast.
                    const isLoserInNearMiss = isNearMiss && idx === 1;
                    const time = raceTime(a.submittedAt, ctx.raceStartedAt);
                    const meta = [time, isNearMiss && idx === 0 ? "winner" : null].filter(Boolean).join(" · ");
                    return (
                      <div
                        key={`${a.by}-${a.word}`}
                        className={cn(
                          "flex min-w-0 flex-col gap-2 rounded-[26px] px-3.5 py-4",
                          isLoserInNearMiss ? "bg-card/45" : "bg-card"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={playerName} size={30} side={a.by} />
                          <span className="truncate text-sm font-bold">{playerName}</span>
                        </div>
                        <AnchoredWord word={a.word.toLowerCase()} size="md" className="!text-[30px]" />
                        {meta ? <div className="text-[13px] font-semibold text-muted-foreground">{meta}</div> : null}
                      </div>
                    );
                  })}
                </div>
                {isNearMiss ? (
                  <div className="-rotate-2 font-hand text-2xl">{`photo finish! ${nearMissDiffMs} ms apart`}</div>
                ) : null}
              </>
            ) : isSingleWinner ? (
              <div className="slide-up-in flex flex-col gap-2.5">
                <h1 className="m-0" aria-label={word}>
                  <AnchoredWord word={word.toLowerCase()} size="md" className="lg:hidden" />
                  <AnchoredWord word={word.toLowerCase()} size="lg" className="hidden lg:inline" />
                </h1>
                <div className="flex items-center gap-2">
                  {ctx.ipa ? <span className="text-base font-semibold text-muted-foreground">{ctx.ipa}</span> : null}
                  <Button
                    variant="pill"
                    size="circle"
                    aria-label={ctx.muted ? "Pronunciation muted. Turn sound on in Settings" : "Play pronunciation"}
                    onClick={playPronunciation}
                    disabled={ctx.muted}
                  >
                    <Play fill="currentColor" />
                  </Button>
                </div>
                <div className="flex flex-col gap-4 rounded-[26px] bg-card px-[18px] py-4">
                  {defs.map((d) => (
                    <div key={`${d.partOfSpeech}-${d.definition.slice(0, 40)}`} className="flex flex-col gap-1.5">
                      {d.partOfSpeech ? (
                        <span className="self-start rounded-full bg-shape-yellow px-2.5 py-0.5 text-xs font-extrabold text-[#141414]">
                          {d.partOfSpeech}
                        </span>
                      ) : null}
                      <div className="text-base leading-[1.4] font-semibold">{d.definition}</div>
                      {d.example ? (
                        <div className="font-hand text-[21px] text-muted-foreground">{`“${d.example}”`}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* Suggestions: every non-replay outcome, so the players always
             *  see a few words that would have worked. */}
            {shouldFetchSuggestions ? (
              <section aria-labelledby="result-suggestions">
                <h2 id="result-suggestions" className="m-0 mb-2.5 text-lg font-bold">
                  {(isSingleWinner && !isForfeit) || hasSideBySide ? "Other words that worked" : "Words you could have played"}
                </h2>
                {suggestions === null ? (
                  <div className="text-sm font-semibold text-muted-foreground">
                    Looking for examples
                    <span aria-hidden className="typing-dots ml-1">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-sm font-semibold text-muted-foreground">
                    {`No ${ctx.minWordLength}+ letter words start with ${ctx.letterStart} and end with ${ctx.letterEnd}. Tough round.`}
                  </div>
                ) : (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {suggestions.map((w) => (
                      <li key={w} className="flex h-10 items-center rounded-full bg-card px-4 text-[15px] font-bold tracking-[0.5px]">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5">
              {scoreCards.map((c) => (
                <div key={c.side} className={cn("relative min-w-0 rounded-[26px] px-4 py-3.5 text-[#141414]", c.fill)}>
                  <div className="truncate pr-11 text-sm font-bold">{c.name}</div>
                  <div className="text-[40px] leading-none font-extrabold tabular-nums">
                    <CountUp from={c.score - c.delta} to={c.score} />
                  </div>
                  {showDelta && c.delta > 0 ? (
                    <span className="absolute top-3 right-3.5 rounded-full bg-[#141414] px-2.5 py-1 text-sm font-extrabold text-white">
                      +{c.delta}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 lg:mt-auto">
              {/* The fill duration is driven by the same value that
               *  schedules the advance, and it freezes while held. */}
              <div
                className="advance-bar"
                data-held={held ? "true" : undefined}
                style={{ "--advance-duration": `${advanceMs}ms` } as React.CSSProperties}
                aria-hidden
              >
                <i />
              </div>
              {fireReplay ? (
                <div role="status" className="flex h-14 items-center justify-center rounded-full bg-card text-base font-bold">
                  Replaying round shortly…
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  {/* Says why nothing is moving: a frozen bar with no
                   *  explanation reads as broken. */}
                  <span className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground" aria-live="polite">
                    {held ? "Paused while you read" : ctx.meIsReferee ? "" : "Next round in a moment…"}
                  </span>
                  {ctx.meIsReferee ? (
                    <Button
                      variant="pill"
                      size="pill-lg"
                      onClick={() => {
                        if (ctx.actions.ready) {
                          void ctx.actions.nextRound();
                        } else {
                          ctx.setPhase("matchend");
                        }
                      }}
                    >
                      Next round <ArrowRight />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
