"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight } from "lucide-react";
import { playDing } from "@/lib/sound";
import { CountUp } from "./count-up";
import { Avatar } from "./avatar";

type SuggestResponse = {
  suggestions: string[];
};

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
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const a = actionsRef.current;
      if (a.ready && ctx.meIsHost) void a.nextRound();
    }, 5200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ctx.meIsHost]);

  // A round can end via five shapes:
  //   1. Single winner   — winner = 'host' | 'guest', word + IPA + defs set
  //   2. Sim tie (split) — winner = 'split', both submitted, both in usedWords
  //   3. Sim tie (nobody) — winner = 'none', reason = 'tied_nobody'
  //   4. Timeout          — reason = 'timeout', winner reflects tieBehavior
  //                         ('none' for nobody-config, 'split' for split-config;
  //                         replay-config goes back to pick and never lands here)
  //   5. Forfeit          — reason = 'forfeit', winner = 'host'|'guest',
  //                         no word played (opponent stayed disconnected)
  const isTimeout = ctx.resultReason === "timeout";
  const isForfeit = ctx.resultReason === "forfeit";
  const isNone = ctx.winner === "none";
  const isSplit = ctx.winner === "split";
  const hasWordsForRound = ctx.used.some((u) => u.round === ctx.round);

  // On timeout, fetch a handful of words that WOULD have worked, so the
  // players see what they missed.
  React.useEffect(() => {
    if (!isTimeout) return;
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
  }, [isTimeout, ctx.letterStart, ctx.letterEnd, ctx.minWordLength]);

  const playPronunciation = React.useCallback(() => {
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
  }, [ctx.audio, ctx.word]);

  // Auto-play pronunciation when the "Audio definitions" setting is on. Tiny
  // delay so the round-win ding doesn't overlap with the pronunciation.
  React.useEffect(() => {
    if (isTimeout) return;
    if (!ctx.settings.audioDefinitions) return;
    if (!ctx.word) return;
    const t = setTimeout(playPronunciation, 700);
    return () => clearTimeout(t);
  }, [isTimeout, ctx.settings.audioDefinitions, ctx.word, playPronunciation]);

  const word = ctx.word;
  const mid = word.slice(1, -1).toLowerCase();
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
            {isForfeit
              ? `${ctx.winner === "host" ? ctx.hostName : ctx.guestName} wins round ${ctx.round} by forfeit`
              : isNone && isTimeout
              ? `Tied round ${ctx.round} — out of time, neither scores`
              : isNone
              ? `Tied round ${ctx.round} — neither scores`
              : isSplit && isTimeout
              ? `Tied round ${ctx.round} — out of time, both score`
              : isSplit
              ? `Tied round ${ctx.round} — ${ctx.hostName} and ${ctx.guestName} both score`
              : `${ctx.winner === "host" ? ctx.hostName : ctx.guestName} won round ${ctx.round}`}
          </div>

          {isSplit && hasWordsForRound ? (
            <>
              {/* Sim-tie-split: both players submitted within the window,
               *  both wrote into usedWords. Render the pair side-by-side.
               *  (timeout-split has no words to show, so it falls through
               *  to the suggestions branch below.) */}
              <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 mt-2 items-start sm:items-center sm:justify-center">
                {ctx.used
                  .filter((u) => u.round === ctx.round)
                  .map((u) => {
                    const playerName =
                      u.by === "host" ? ctx.hostName : ctx.guestName;
                    return (
                      <div
                        key={`${u.by}-${u.word}`}
                        className="flex flex-col items-center"
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
                          <span className="anchor">{u.word[0]}</span>
                          <span>{u.word.slice(1, -1)}</span>
                          <span className="anchor">
                            {u.word[u.word.length - 1]}
                          </span>
                        </h2>
                        {u.ipa ? (
                          <span
                            className="result-ipa"
                            style={{ fontSize: 14, marginTop: 4 }}
                          >
                            {u.ipa}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </>
          ) : isNone && !isTimeout ? (
            // Sim-tie-nobody: both submitted, neither scored. No word to
            // show, no suggestions needed (players already tried). Title
            // above is enough.
            null
          ) : isForfeit ? (
            // Forfeit: opponent stayed disconnected through the 10s grace
            // period. The title above (X wins round Y by forfeit) tells
            // the whole story — no word was played, no suggestions.
            null
          ) : !isNone && !isSplit ? (
            <>
              <h1 className="result-word">
                <span className="anchor">{word[0]}</span>
                <span>{mid}</span>
                <span className="anchor">{word[word.length - 1]}</span>
              </h1>

              <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
                {ctx.ipa ? (
                  <span className="result-ipa">{ctx.ipa}</span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Play pronunciation"
                  className="h-7 w-7"
                  onClick={playPronunciation}
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
          ) : (
            <div style={{ marginTop: 20 }}>
              <div className="t-label-up" style={{ marginBottom: 8 }}>
                Words you could have played
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
          )}

          <div className="flex items-center justify-between" style={{ marginTop: 28 }}>
            <div
              className="flex items-center gap-4 font-mono relative"
              style={{ fontSize: 13 }}
            >
              {(() => {
                // Map the canonical winner ('host' | 'guest' | 'split' | 'none')
                // onto caller-relative "you got a point / they got a point". Split
                // gives both, 'none' (timeout) gives neither. We also derive the
                // pre-increment score so <CountUp> animates from old → current,
                // reinforcing the +1 delta float.
                const meRole: "host" | "guest" = ctx.meIsHost ? "host" : "guest";
                const themRole: "host" | "guest" = ctx.meIsHost ? "guest" : "host";
                const youGotPoint =
                  ctx.winner === meRole || ctx.winner === "split";
                const themGotPoint =
                  ctx.winner === themRole || ctx.winner === "split";
                const yourPrev = ctx.you.score - (youGotPoint ? 1 : 0);
                const theirPrev = ctx.them.score - (themGotPoint ? 1 : 0);
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
                          +1
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
                          +1
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
