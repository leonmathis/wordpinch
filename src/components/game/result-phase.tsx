"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight } from "lucide-react";
import { playDing } from "@/lib/sound";

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

  // Auto-advance after the 5s advance-bar fill completes. Both clients fire
  // the action; only the host's POST succeeds (guests 403 silently), which
  // matches the rest of Phase 6.
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      if (ctx.actions.ready) void ctx.actions.nextRound();
    }, 5200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ctx.actions]);

  const isTimeout = ctx.winner === "none";

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

  const word = ctx.word;
  const mid = word.slice(1, -1).toLowerCase();
  const timeout = isTimeout;
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
      <TopChrome
        round={ctx.round}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
      />
      <div className="wp-body">
        <div className="wp-frame scene">
          {timeout ? (
            <div className="t-label-up">
              No one won round {ctx.round} — out of time
            </div>
          ) : (
            <div className="t-label-up">
              {ctx.winner === "guest" ? ctx.them.name : ctx.you.name} won round{" "}
              {ctx.round}
            </div>
          )}

          {!timeout ? (
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
              <span>
                <span className="text-muted-foreground">{ctx.you.name}</span>{" "}
                <span className="tabular-nums">{ctx.you.score}</span>
                {showDelta && ctx.winner === "host" ? (
                  <span
                    className="score-delta float-up"
                    style={{ position: "absolute", marginLeft: 6 }}
                  >
                    +1
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                <span className="text-muted-foreground">{ctx.them.name}</span>{" "}
                <span className="tabular-nums">{ctx.them.score}</span>
              </span>
            </div>
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
          </div>

          <div className="advance-bar" style={{ marginTop: 14 }}>
            <i />
          </div>
        </div>
      </div>
    </>
  );
}
