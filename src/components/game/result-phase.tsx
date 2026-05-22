"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight } from "lucide-react";
import { playDing } from "@/lib/sound";
import { CountUp } from "./count-up";
import { Avatar } from "./avatar";

type SuggestResponse = {
  suggestions: string[];
};

/**
 * Per-character entrance for the round-winning word. Mirrors the room
 * code stagger in the lobby — each letter pops in with a slight scale +
 * y-rise, anchor letters (first / last) keep their bolder styling via
 * the `.anchor` class. Drops to a single opacity fade for viewers with
 * `prefers-reduced-motion` set.
 */
function StaggeredResultWord({
  word,
  charDelay = 0.04,
  duration = 0.42,
}: {
  word: string;
  charDelay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.h1
      className="result-word"
      aria-label={word}
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: { transition: { staggerChildren: reduce ? 0 : charDelay } },
      }}
    >
      {word.split("").map((c, i) => {
        const isAnchor = i === 0 || i === word.length - 1;
        // Match the original casing rule: anchors carry the word's
        // own case (uppercase from the server), interior chars
        // lowercase for the playful display.
        const display = isAnchor ? c : c.toLowerCase();
        return (
          <motion.span
            key={`${word}-${i}`}
            className={isAnchor ? "anchor" : undefined}
            aria-hidden
            variants={{
              initial: reduce
                ? { opacity: 0 }
                : { opacity: 0, y: 10, scale: 0.85 },
              animate: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "inline-block" }}
          >
            {display}
          </motion.span>
        );
      })}
    </motion.h1>
  );
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
    try {
      navigator.vibrate?.(10);
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
  React.useEffect(() => {
    actionsRef.current = ctx.actions;
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
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const a = actionsRef.current;
      if (!a.ready || !ctx.meIsHost) return;
      if (fireReplay) void a.replayRound();
      else void a.nextRound();
    }, advanceMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ctx.meIsHost, advanceMs, fireReplay]);

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
  // Fallback definitions only render when we somehow lost the API result —
  // never used in normal play, but keeps the UI from showing blank.
  const FALLBACK_DEFS = [
    {
      partOfSpeech: "noun",
      definition: "No definition available.",
      example: undefined,
    },
  ];
  const defs = ctx.definitions.length > 0 ? ctx.definitions : FALLBACK_DEFS;

  return (
    <>
      <div className="wp-body">
        <div className="wp-frame scene">
          {/* Canonical names everywhere — the viewer-perspective ctx.you /
              ctx.them flip would otherwise show the guest seeing host's
              name when *they* (the guest) win. */}
          <div className="t-label-up">
            {isReplayPending
              ? `Tied round ${ctx.round} — replaying`
              : isForfeit
              ? `${ctx.winner === "host" ? ctx.hostName : ctx.guestName} wins round ${ctx.round} by forfeit`
              : isNone && isTimeout
              ? `Tied round ${ctx.round} — out of time, neither scores`
              : isNone
              ? `Tied round ${ctx.round} — neither scores`
              : isSplit && isTimeout
              ? `Tied round ${ctx.round} — out of time, both score`
              : isSplit
              ? `Tied round ${ctx.round} — ${ctx.hostName} and ${ctx.guestName} both score`
              : isNearMiss
              ? `${ctx.winner === "host" ? ctx.hostName : ctx.guestName} won round ${ctx.round} by ${nearMissDiffMs} ms`
              : `${ctx.winner === "host" ? ctx.hostName : ctx.guestName} won round ${ctx.round}`}
          </div>

          {hasSideBySide ? (
            <>
              {/* Sim tie (split or replay_pending): render both submissions
               *  side-by-side using the attempts captured by the resolver.
               *  Timeout-split has no attempts → falls through to the
               *  suggestions branch below. */}
              <motion.div
                className="flex flex-col sm:flex-row gap-6 sm:gap-10 mt-2 items-start sm:items-center sm:justify-center"
                initial="initial"
                animate="animate"
                variants={{
                  initial: {},
                  // Columns stagger 80 ms apart so the eye reads
                  // attempt[0] (the winner) first, then the
                  // near-miss / co-tied attempt. Skipped under
                  // reduced motion via the column variant below.
                  animate: { transition: { staggerChildren: 0.08 } },
                }}
              >
                {sideBySideAttempts.map((a, idx) => {
                  const playerName =
                    a.by === "host" ? ctx.hostName : ctx.guestName;
                  // In a near-miss the first attempt is the winner; the
                  // second is the loser whose submission landed in the
                  // grace window. Dim the loser column for visual hierarchy.
                  const isLoserInNearMiss = isNearMiss && idx === 1;
                  return (
                    <motion.div
                      key={`${a.by}-${a.word}`}
                      className="flex flex-col items-center"
                      style={{
                        opacity: isLoserInNearMiss ? 0.55 : 1,
                      }}
                      variants={{
                        initial: { opacity: 0, y: 10 },
                        animate: {
                          // Re-apply the dim-loser opacity here so the
                          // variant doesn't override it back to 1 mid-fade.
                          opacity: isLoserInNearMiss ? 0.55 : 1,
                          y: 0,
                        },
                      }}
                      transition={{
                        duration: 0.4,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <div
                        className="flex items-center gap-2"
                        style={{ marginBottom: 6 }}
                      >
                        <Avatar name={playerName} size={20} />
                        <span className="t-label-up">{playerName}</span>
                      </div>
                      <h2
                        className="result-word"
                        style={{ fontSize: 40, lineHeight: 1.1 }}
                      >
                        <span className="anchor">{a.word[0]}</span>
                        <span>{a.word.slice(1, -1)}</span>
                        <span className="anchor">
                          {a.word[a.word.length - 1]}
                        </span>
                      </h2>
                      {a.ipa ? (
                        <span
                          className="result-ipa"
                          style={{ fontSize: 14, marginTop: 4 }}
                        >
                          {a.ipa}
                        </span>
                      ) : null}
                    </motion.div>
                  );
                })}
              </motion.div>
              {isReplayPending ? (
                <div
                  className="t-label text-center"
                  style={{ marginTop: 24 }}
                >
                  Replaying round shortly…
                </div>
              ) : null}
            </>
          ) : isForfeit ? (
            // Forfeit: opponent stayed disconnected through the 10s grace
            // period. The title above (X wins round Y by forfeit) tells
            // the whole story — no word was played. Suggestions still
            // render below this branch.
            null
          ) : !isNone && !isSplit ? (
            <>
              <StaggeredResultWord word={word} />

              <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
                {ctx.ipa ? (
                  <span className="result-ipa">{ctx.ipa}</span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    ctx.muted
                      ? "Pronunciation muted — unmute in the top bar"
                      : "Play pronunciation"
                  }
                  className="h-7 w-7"
                  onClick={playPronunciation}
                  disabled={ctx.muted}
                  type="button"
                >
                  <Play strokeWidth={1.7} className="size-[15px]" />
                </Button>
              </div>

              <div style={{ marginTop: 28 }}>
                {defs.map((d, i) => (
                  <div key={i} className="def-block">
                    <div className="def-label">{d.partOfSpeech || "—"}</div>
                    <div className="def">{d.definition}</div>
                    {d.example ? (
                      <div className="ex">&ldquo;{d.example}&rdquo;</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* Suggestions: rendered for every non-replay outcome (win,
           *  lose, sim-tie, near-miss, timeout, forfeit) so the players
           *  always see a handful of alternative words that would have
           *  worked. Headline reads "Other words..." when there *is* a
           *  played word above this block, plain "Words..." otherwise,
           *  so the grammar lands for both contexts. */}
          {shouldFetchSuggestions ? (
            <div style={{ marginTop: 28 }}>
              <div className="t-label-up" style={{ marginBottom: 8 }}>
                {isSingleWinner && !isForfeit
                  ? "Other words that worked"
                  : hasSideBySide
                  ? "Other words that worked"
                  : "Words you could have played"}
              </div>
              {suggestions === null ? (
                <div className="t-label">
                  Looking for examples
                  <span className="typing-dots ml-1">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="t-label">
                  No {ctx.minWordLength}+ letter words start with{" "}
                  <b style={{ color: "var(--foreground)" }}>{ctx.letterStart}</b>{" "}
                  and end with{" "}
                  <b style={{ color: "var(--foreground)" }}>{ctx.letterEnd}</b>
                  . Tough round.
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[14px]">
                  {suggestions.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between" style={{ marginTop: 28 }}>
            <div
              className="flex items-center gap-4 font-mono relative"
              style={{ fontSize: 13 }}
            >
              {(() => {
                // Compute the score delta this round per side, mirroring the
                // server-side scoring math in `computeFinalState` /
                // `recordNearMiss`. The delta drives both the pre-increment
                // value passed to <CountUp> and the "+N" float, so all three
                // (final score, animation start, badge) stay consistent
                // even when the length-bonus setting kicks in (e.g. "+1.5"
                // for a 6-letter solo win at min=5).
                const meRole: "host" | "guest" = ctx.meIsHost ? "host" : "guest";
                const themRole: "host" | "guest" = ctx.meIsHost ? "guest" : "host";
                const bonusEnabled = ctx.settings.lengthBonus ?? false;
                const wordBonus = (word: string | undefined) => {
                  if (!bonusEnabled || !word) return 0;
                  const extra = word.length - ctx.minWordLength;
                  return extra > 0 ? extra * 0.5 : 0;
                };
                const roundDelta = (side: "host" | "guest"): number => {
                  if (isReplayPending) return 0;
                  if (isForfeit) return ctx.winner === side ? 1 : 0;
                  if (isTimeout) {
                    // Timeout has no submissions to bonus; split awards 1
                    // base to each, otherwise nobody.
                    return isSplit ? 1 : 0;
                  }
                  const myAttempt = ctx.resultAttempts?.find(
                    (a) => a.by === side
                  );
                  const bonus = wordBonus(myAttempt?.word);
                  // Won outright OR sim-tie split (both score).
                  if (ctx.winner === side || isScoredSplit) {
                    return 1 + bonus;
                  }
                  // Tied-nobody with both submitted: only the bonus.
                  if (isNone && myAttempt) return bonus;
                  // Other side won outright; near-miss attempt (if any)
                  // earns just the bonus.
                  if (myAttempt) return bonus;
                  return 0;
                };
                const yourDelta = roundDelta(meRole);
                const themDelta = roundDelta(themRole);
                const youGotPoint = yourDelta > 0;
                const themGotPoint = themDelta > 0;
                const yourPrev = ctx.you.score - yourDelta;
                const theirPrev = ctx.them.score - themDelta;
                return (
                  <>
                    <span className="relative">
                      <span className="text-muted-foreground">{ctx.you.name}</span>{" "}
                      <span className="tabular-nums">
                        <CountUp from={yourPrev} to={ctx.you.score} />
                      </span>
                      {showDelta && youGotPoint ? (
                        <span
                          className="score-delta float-up"
                          style={{ position: "absolute", marginLeft: 6 }}
                        >
                          +{yourDelta}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="relative">
                      <span className="text-muted-foreground">{ctx.them.name}</span>{" "}
                      <span className="tabular-nums">
                        <CountUp from={theirPrev} to={ctx.them.score} />
                      </span>
                      {showDelta && themGotPoint ? (
                        <span
                          className="score-delta float-up"
                          style={{ position: "absolute", marginLeft: 6 }}
                        >
                          +{themDelta}
                        </span>
                      ) : null}
                    </span>
                  </>
                );
              })()}
            </div>
            {ctx.meIsHost ? (
              <Button
                variant="link"
                onClick={() => {
                  if (ctx.actions.ready) {
                    void ctx.actions.nextRound();
                  } else {
                    ctx.setPhase("matchend");
                  }
                }}
                className="link-underline h-auto p-0 gap-1.5 font-mono text-[13px] text-foreground no-underline hover:no-underline"
              >
                Next <ArrowRight strokeWidth={1.7} className="size-[13px]" />
              </Button>
            ) : null}
          </div>

          <div className="advance-bar" style={{ marginTop: 14 }}>
            <i />
          </div>
        </div>
      </div>
    </>
  );
}
