"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import type { GameCtx } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OpponentAwayBanner } from "./opponent-away";
import { Shape, ShapeGlyph } from "./kit/shape";
import { WordsPlayed } from "./words-played";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLS = 7;

/**
 * How long to wait, after locking, before offering a way out of a stalled
 * pick. Nothing else resolves this state: no timer runs during pick, and
 * the forfeit path only covers an opponent who has actually disconnected —
 * so an idle-but-connected opponent left the other player waiting forever.
 * Long enough that it can't be used to rush someone who is thinking.
 */
const IDLE_PROMPT_MS = 45_000;

/** Typing these anywhere on the page picks or locks; inputs keep their keys. */
function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/**
 * The 26 letters as a radio group: one tab stop, arrow keys move and
 * select (up/down by a row), Home/End jump. 44px keys on phones, 60px from
 * 1024px; the 4px phone gap keeps keys ≥44px wide in a 342px frame.
 */
function LetterGrid({
  value,
  disabled,
  onPick,
}: {
  value: string;
  disabled: boolean;
  onPick: (letter: string) => void;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, ALPHABET.indexOf(value));
  const move = (to: number) => {
    const i = Math.min(ALPHABET.length - 1, Math.max(0, to));
    onPick(ALPHABET[i]);
    refs.current[i]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    if (step) move(current + step);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(ALPHABET.length - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Choose a letter"
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
      className={cn(
        "grid grid-cols-7 gap-1 transition-opacity motion-reduce:transition-none lg:gap-2.5",
        disabled && "opacity-45"
      )}
    >
      {ALPHABET.map((l, i) => {
        const on = l === value;
        return (
          <Button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={on}
            tabIndex={i === current ? 0 : -1}
            disabled={disabled}
            onClick={() => onPick(l)}
            // Disabled keys are the whole grid dimmed at once, not
            // individually faded on top of that.
            className={cn(
              "h-11 min-w-0 rounded-full p-0 text-base font-extrabold disabled:opacity-100 lg:h-15 lg:text-xl",
              on ? "bg-primary text-primary-foreground hover:bg-primary/85" : "bg-card text-card-foreground hover:bg-card/80"
            )}
          >
            {l}
          </Button>
        );
      })}
    </div>
  );
}

export function PickPhase({ ctx }: { ctx: GameCtx }) {
  const [locked, setLocked] = React.useState(false);
  const [locking, setLocking] = React.useState(false);
  const [val, setVal] = React.useState("");
  const [idleTooLong, setIdleTooLong] = React.useState(false);
  const iAmFirst =
    (ctx.meIsHost && ctx.firstPicker === "host") || (!ctx.meIsHost && ctx.firstPicker === "guest");

  // Start counting once this player has locked and is just waiting.
  React.useEffect(() => {
    if (!locked) {
      const reset = setTimeout(() => setIdleTooLong(false), 0);
      return () => clearTimeout(reset);
    }
    const t = setTimeout(() => setIdleTooLong(true), IDLE_PROMPT_MS);
    return () => clearTimeout(t);
  }, [locked]);

  const lock = React.useCallback(async () => {
    if (!val || locking || locked) return;
    if (!ctx.actions.ready) {
      // No room wired up (design preview) — keep the local-only behaviour.
      setLocked(true);
      return;
    }
    setLocking(true);
    // Optimistic, but reversible: the lock used to be applied
    // unconditionally while the POST result was ignored, so a failed
    // request left this player "waiting for opponent" forever against a
    // server that never recorded their letter.
    setLocked(true);
    const ok = await ctx.actions.lockMyLetter(val);
    setLocking(false);
    if (!ok) setLocked(false);
  }, [val, locking, locked, ctx.actions]);

  // A physical keyboard still works: typing a letter picks it, Enter locks.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // Leave keys alone inside menus and dialogs.
      if (e.target instanceof HTMLElement && e.target.closest("[role='dialog'], [data-slot='popover-content']")) return;
      if (/^[a-z]$/i.test(e.key)) {
        setVal(e.key.toUpperCase());
      } else if (e.key === "Enter" && val) {
        const t = e.target;
        // Enter on another button (Settings, Words played) keeps its own meaning.
        if (t instanceof HTMLElement && t.closest("button") && !t.closest("[role='radiogroup']")) return;
        e.preventDefault();
        void lock();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [locked, val, lock]);

  const mineSize = "size-[84px] lg:size-[120px]";
  const mine = (size: number) =>
    val ? (
      <ShapeGlyph
        kind={iAmFirst ? "square" : "star"}
        size={size}
        glyph={val}
        fill={iAmFirst ? "var(--shape-blue)" : "var(--shape-yellow)"}
      />
    ) : (
      <Shape kind={iAmFirst ? "square" : "star"} size={size} fill={iAmFirst ? "var(--shape-blue)" : "var(--shape-yellow)"} />
    );
  const mySlot = (
    <div className={cn("relative shrink-0", mineSize)}>
      <span className="lg:hidden">{mine(84)}</span>
      <span className="hidden lg:block">{mine(120)}</span>
      {locked ? (
        <span
          aria-label="Locked"
          role="img"
          className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Lock aria-hidden className="size-3.5" strokeWidth={2.6} />
        </span>
      ) : null}
    </div>
  );
  const theirSlot = (
    <div role="img" aria-label={`${ctx.them.name}'s letter, hidden until the reveal`} className={cn("shrink-0", mineSize)}>
      <span aria-hidden className="lg:hidden">
        <ShapeGlyph kind="ring" size={84} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      </span>
      <span aria-hidden className="hidden lg:block">
        <ShapeGlyph kind="ring" size={120} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      </span>
    </div>
  );

  const status = (
    <div className="flex flex-col gap-2.5">
      {locked && idleTooLong && ctx.opponentOnline ? (
        // Escape hatch for an opponent who is connected but idle. Resolves
        // the round as "out of time", the same outcome as running down the
        // race clock, so using it can never win anyone a point.
        <div className="flex items-center gap-3 rounded-[26px] bg-card py-3 pr-3 pl-4">
          <span className="min-w-0 flex-1 text-[15px] font-bold [overflow-wrap:anywhere]">
            {`${ctx.them.name} still hasn’t picked.`}
          </span>
          <Button
            variant="pill-soft"
            size="pill-md"
            className="bg-row"
            onClick={() => {
              if (ctx.actions.ready) void ctx.actions.skipStalledRound();
            }}
          >
            Skip this round
          </Button>
        </div>
      ) : null}
      {!locked || locking ? (
        <Button variant="pill" size="pill-lg" className="w-full" disabled={!val || locking} onClick={() => void lock()}>
          {locking ? "Locking…" : val ? `Lock in ${val}` : "Pick a letter"}
        </Button>
      ) : (
        <>
          <div
            role="status"
            className="flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-card px-5 py-2 text-center text-base font-bold"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">Locked in. Waiting for {ctx.them.name}</span>
            <span aria-hidden className="typing-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
          {/* Letters stay server-private until both are in, so changing
           *  yours before the reveal leaks nothing — and a mistyped letter
           *  was otherwise stuck for the round. */}
          <Button
            variant="ghost"
            className="h-11 self-center text-[15px] font-bold underline underline-offset-4 hover:bg-transparent"
            onClick={() => setLocked(false)}
          >
            Change letter
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="wp-body">
      <div className="wp-frame scene lg:max-w-[1040px]">
        {/* Pick had no disconnect handling at all: no timer runs here, so
         *  an opponent who left stranded the other player indefinitely. */}
        {!ctx.opponentOnline ? (
          <div className="mb-[18px] w-full">
            {/* The attention pink is the pick background, so the banner
             *  turns white here (it stays pink on the dark ground). */}
            <OpponentAwayBanner ctx={ctx} className="mb-0 bg-card dark:bg-shape-pink" />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-[18px] lg:[grid-template-areas:'head_letters''status_letters']">
          <div className="flex min-w-0 flex-col gap-[18px] lg:[grid-area:head]">
            <h1 className="m-0 text-[34px] leading-none font-extrabold tracking-[-1px] lg:text-5xl">
              {locked ? "Nice pick," : "Pick the"}
              <br />
              <span className="font-hand text-[40px] font-normal tracking-normal lg:text-[56px]">
                {locked ? "now we wait" : iAmFirst ? "first letter" : "last letter"}
              </span>
            </h1>
            <div className="flex items-center gap-3.5">
              {iAmFirst ? mySlot : theirSlot}
              <span aria-hidden className="font-hand text-[28px] tracking-[3px] text-muted-foreground lg:text-[40px]">
                _ _ _
              </span>
              {iAmFirst ? theirSlot : mySlot}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2.5 lg:[grid-area:letters]">
            <h2 className="m-0 text-lg font-bold">Letters</h2>
            <LetterGrid value={val} disabled={locked} onPick={setVal} />
          </div>

          <div className="flex min-w-0 flex-col gap-2.5 lg:self-start lg:gap-[18px] lg:[grid-area:status]">
            {status}
            <WordsPlayed words={ctx.used.filter((u) => u.round < ctx.round)} />
          </div>
        </div>
      </div>
    </div>
  );
}
