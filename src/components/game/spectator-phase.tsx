"use client";

import * as React from "react";
import { Check, Eye } from "lucide-react";
import type { GameCtx } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { AnchoredWord } from "./kit/anchored-word";
import { LetterSlots } from "./kit/letter-slots";
import { ShapeGlyph } from "./kit/shape";
import { StatusPill } from "./kit/status-pill";
import { RoundsTable } from "./rounds-table";
import { CHEERS } from "@/lib/room-fx";
import { ReactionBubble, ReactionPills } from "./reactions";

/**
 * Drives a once-per-second countdown clamped to [0, total]. Initial value
 * is computed lazily from raceStartedAt so a spectator joining mid-round
 * shows the correct remaining time rather than starting fresh at total.
 */
function useRaceClock(total: number, raceStartedAt: number | undefined) {
  const [left, setLeft] = React.useState(() => {
    if (!raceStartedAt) return total;
    const elapsed = Math.floor((Date.now() - raceStartedAt) / 1000);
    return Math.max(0, total - elapsed);
  });

  React.useEffect(() => {
    if (!raceStartedAt) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - raceStartedAt) / 1000);
      setLeft(Math.max(0, total - elapsed));
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [total, raceStartedAt]);

  return left;
}

const HEAD = "m-0 text-[34px] leading-none font-extrabold tracking-[-1px]";
const HAND = "font-hand text-[40px] font-normal tracking-normal";
const SIDES = ["host", "guest"] as const;

function nameOf(ctx: GameCtx, side: "host" | "guest") {
  return side === "host" ? ctx.hostName : ctx.guestName;
}

function SpectatorLobby({ ctx }: { ctx: GameCtx }) {
  return (
    <>
      <div>
        <div className="text-[56px] leading-none font-extrabold tracking-[3px]">{ctx.roomCode}</div>
        <div className="font-hand text-[30px] leading-[1.1]">the match hasn&rsquo;t started yet</div>
      </div>
      <section aria-label="Players" className="flex flex-col gap-2.5 rounded-[28px] bg-card p-3.5">
        {SIDES.map((side) =>
          side === "guest" && !ctx.guestPresent ? (
            <div key={side} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground font-hand text-[22px] text-muted-foreground"
              >
                ?
              </span>
              <span className="font-hand text-2xl text-muted-foreground">waiting for a player…</span>
            </div>
          ) : (
            <div key={side} className="flex min-w-0 items-center gap-3">
              <Avatar name={nameOf(ctx, side)} side={side} size={44} />
              <span className="min-w-0 flex-1 truncate text-base font-bold">{nameOf(ctx, side)}</span>
              <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[13px] font-extrabold text-primary-foreground">
                Ready
              </span>
            </div>
          )
        )}
      </section>
    </>
  );
}

function SpectatorPick({ ctx }: { ctx: GameCtx }) {
  // Both letters stay server-private until both are locked, so a
  // spectator sees two "?" and who picks which end. Lock status is not in
  // the client state at all (lib/game/sanitize.ts).
  return (
    <>
      <h1 className={HEAD}>
        Both are
        <br />
        <span className={HAND}>picking letters…</span>
      </h1>
      <div className="flex items-start justify-center gap-[18px] py-2">
        {(ctx.firstPicker === "host" ? SIDES : ([...SIDES].reverse() as ("host" | "guest")[])).map((side, i) => (
          <React.Fragment key={side}>
            {i === 1 ? (
              <span aria-hidden className="mt-6 font-hand text-[30px] tracking-[3px] text-muted-foreground">
                _ _ _
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col items-center gap-2">
              <ShapeGlyph kind="ring" size={84} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
              <span className="max-w-[120px] truncate text-sm font-bold">{`${nameOf(ctx, side)} · ${i === 0 ? "first" : "last"}`}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

function SpectatorRace({ ctx, timer }: { ctx: GameCtx; timer: boolean }) {
  const total = ctx.roundTimerSec || 60;
  const left = useRaceClock(total, ctx.raceStartedAt);
  return (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <LetterSlots
          first={ctx.letterStart || null}
          last={ctx.letterEnd || null}
          size={84}
          firstFill={timer ? "var(--shape-blue)" : "var(--shape-yellow)"}
          className="justify-start gap-2"
        />
        {timer ? (
          <div
            role="timer"
            aria-label={`${left} seconds left`}
            className={cn(
              "flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums",
              left <= 5 ? "bg-shape-magenta text-white" : "bg-shape-yellow text-[#141414]"
            )}
          >
            {left}
          </div>
        ) : null}
      </div>
      {timer ? (
        <>
          {/* Each player's real state, from presence and pendingResult; it
           *  used to say "typing" for both, always. */}
          <div className="flex flex-col gap-2.5">
            {SIDES.map((side) => {
              const seat = ctx.seats[side];
              const name = nameOf(ctx, side);
              return (
                <div key={side} className="flex min-w-0 items-center gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5">
                  <Avatar name={name} side={side} size={36} dim={!seat.online} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {!seat.online ? `${name} is offline` : seat.submitted ? `${name} submitted a word` : `${name} is in the round`}
                  </span>
                  {seat.online && seat.submitted ? (
                    <Check aria-hidden className="size-[18px] shrink-0" strokeWidth={2.8} />
                  ) : seat.online && (ctx.fx.lens[side] ?? 0) > 1 ? (
                    <span className="shrink-0 text-sm font-bold text-muted-foreground tabular-nums">{`${ctx.fx.lens[side]} letters`}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="text-center font-hand text-2xl text-muted-foreground">words stay secret until the round ends</div>
        </>
      ) : null}
    </>
  );
}

function ScoreCards({ ctx }: { ctx: GameCtx }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {SIDES.map((side, i) => (
        <div key={side} className={cn("min-w-0 rounded-[26px] px-4 py-3.5 text-[#141414]", i === 0 ? "bg-shape-yellow" : "bg-shape-pink")}>
          <div className="truncate text-sm font-bold">{nameOf(ctx, side)}</div>
          <div className="text-[40px] leading-none font-extrabold tabular-nums">{side === "host" ? ctx.you.score : ctx.them.score}</div>
        </div>
      ))}
    </div>
  );
}

function SpectatorResult({ ctx }: { ctx: GameCtx }) {
  const single = ctx.winner === "host" || ctx.winner === "guest";
  const title = single
    ? ctx.resultReason === "forfeit"
      ? `${nameOf(ctx, ctx.winner as "host" | "guest")} wins round ${ctx.round} by forfeit`
      : `${nameOf(ctx, ctx.winner as "host" | "guest")} won round ${ctx.round}`
    : ctx.winner === "split"
      ? `Tied round ${ctx.round}: both score`
      : `Round ${ctx.round}: nobody scored`;
  const first = ctx.resultAttempts?.[0];
  const time = first && ctx.raceStartedAt ? `${((first.submittedAt - ctx.raceStartedAt) / 1000).toFixed(1)} s` : null;
  return (
    <>
      <div className="self-start rounded-full bg-card px-3.5 py-2 text-sm font-bold [overflow-wrap:anywhere]">{title}</div>
      {ctx.word ? (
        <div className="flex flex-col gap-2">
          <h1 className="m-0" aria-label={ctx.word}>
            <AnchoredWord word={ctx.word.toLowerCase()} />
          </h1>
          {ctx.ipa || time ? (
            <div className="text-base font-semibold text-muted-foreground">{[ctx.ipa, time].filter(Boolean).join(" · ")}</div>
          ) : null}
        </div>
      ) : null}
      <ScoreCards ctx={ctx} />
    </>
  );
}

function SpectatorMatchEnd({ ctx }: { ctx: GameCtx }) {
  const host = ctx.you.score;
  const guest = ctx.them.score;
  const tie = host === guest;
  // Winner first, in the headline and the score pills; it used to print
  // the host first whoever won.
  const order: ("host" | "guest")[] = guest > host ? ["guest", "host"] : ["host", "guest"];
  const scoreOf = (side: "host" | "guest") => (side === "host" ? host : guest);
  return (
    <>
      <h1 className="m-0 text-[44px] leading-[0.98] font-extrabold tracking-[-1.5px] [overflow-wrap:anywhere]">
        {tie ? "Dead heat!" : nameOf(ctx, order[0])}
        <br />
        <span className="font-hand text-[50px] font-normal tracking-normal">{tie ? "nobody blinks" : "pinched it!"}</span>
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        {order.map((side, i) => (
          <span
            key={side}
            className={cn(
              "max-w-full truncate rounded-full px-[18px] py-2 text-[28px] font-extrabold",
              i === 0 || tie ? "bg-shape-yellow text-[#141414]" : "bg-card"
            )}
          >
            {`${nameOf(ctx, side)} ${scoreOf(side)}`}
          </span>
        ))}
      </div>
      <div className="font-hand text-2xl text-muted-foreground">waiting to see if they go again…</div>
      {/* Spectators used to get the headline and nothing else — no way to
       *  see what was actually played. Same summary the players get. */}
      <RoundsTable ctx={ctx} />
    </>
  );
}

/** F3: spectators cheer the players on; the bubble shows the room's latest. */
function Cheers({ ctx }: { ctx: GameCtx }) {
  return (
    <section aria-labelledby="cheer-label" className="relative mt-2 flex flex-col gap-2.5">
      <ReactionBubble ctx={ctx} className="right-0 -top-10" />
      <div id="cheer-label" className="text-[13px] font-bold text-muted-foreground">
        Cheer from the sidelines
        <span className="ml-1.5 rounded-full bg-shape-pink px-2 py-0.5 text-[11px] font-extrabold text-[#141414]">New</span>
      </div>
      <ReactionPills ctx={ctx} ids={CHEERS} label="Cheers" />
    </section>
  );
}

/**
 * Read-only view rendered for any client whose role resolves to 'spectator'.
 * The inner content switches on the active game phase so a spectator who
 * joins mid-match sees what's actually happening rather than a generic
 * "watching..." placeholder. The banner sits in normal flow, so nothing
 * needs padding to clear it.
 */
export function SpectatorPhase({ ctx }: { ctx: GameCtx }) {
  return (
    <div className="wp-body">
      <div className="wp-frame gap-[18px] lg:max-w-[720px]">
        <StatusPill
          role="status"
          icon={<Eye />}
          action={ctx.watchers !== null ? <span className="pr-2 text-[13px] font-bold text-muted-foreground">{`${ctx.watchers} here`}</span> : undefined}
        >
          You&rsquo;re watching. Both seats are taken.
        </StatusPill>
        {ctx.phase === "lobby" ? <SpectatorLobby ctx={ctx} /> : null}
        {ctx.phase === "pick" ? <SpectatorPick ctx={ctx} /> : null}
        {ctx.phase === "reveal" ? <SpectatorRace ctx={ctx} timer={false} /> : null}
        {ctx.phase === "race" ? <SpectatorRace ctx={ctx} timer /> : null}
        {ctx.phase === "result" ? <SpectatorResult ctx={ctx} /> : null}
        {ctx.phase === "matchend" ? <SpectatorMatchEnd ctx={ctx} /> : null}
        <Cheers ctx={ctx} />
      </div>
    </div>
  );
}
