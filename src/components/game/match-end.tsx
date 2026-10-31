"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, MoveHorizontal, Share2, Zap } from "lucide-react";
import type { GameCtx } from "@/lib/game/types";
import { matchAwards, type Award } from "@/lib/game/awards";
import { Button } from "@/components/ui/button";
import { Shape } from "./kit/shape";
import { RoundsTable } from "./rounds-table";
import { playChime } from "@/lib/sound";
import confetti from "canvas-confetti";

const ShareResultDialog = dynamic(
  () => import("./share-result-dialog").then((m) => ({ default: m.ShareResultDialog })),
  { ssr: false }
);

const SCORE_SHORT = 0.33;
const SCORE_LONG = 0.24;
const NAME_W = 0.42;

/**
 * A score flower: points over the name. The flower's scallops leave less
 * room than its box suggests, so half points ("3.5") step down a size and
 * the name is capped narrower than the safe area; measured ≥12px off the
 * outline (tests/e2e/matchend.spec.ts).
 */
function ScoreFlower({ score, name, fill, size }: { score: number; name: string; fill: string; size: number }) {
  const digits = String(score).length;
  return (
    <Shape kind="flower" size={size} fill={fill}>
      <span className="leading-none font-extrabold tabular-nums" style={{ fontSize: Math.round(size * (digits > 1 ? SCORE_LONG : SCORE_SHORT)) }}>
        {score}
      </span>
      <span className="block truncate font-bold" style={{ fontSize: 12, maxWidth: Math.round(size * NAME_W) }}>
        {name}
      </span>
    </Shape>
  );
}

function AwardCard({ icon, label, award }: { icon: React.ReactNode; label: string; award: Award }) {
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded-[26px] bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground uppercase [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold [overflow-wrap:anywhere] uppercase">{award.word}</div>
      <div className="truncate text-[13px] font-semibold text-muted-foreground">{`${award.by} · ${award.detail}`}</div>
    </div>
  );
}

/**
 * Words this match added to the player's collection (F2). Counted by the
 * server, so a word that was already collected before the match doesn't
 * count as new. Nothing shows until there is at least one.
 */
function useNewWords(ctx: GameCtx): number {
  const { enabled, preview, previewCount } = ctx.collection;
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    if (!enabled || preview || !ctx.roomCode) return;
    let cancelled = false;
    fetch(`/api/rooms/${ctx.roomCode}/collected`)
      .then((r) => (r.ok ? (r.json() as Promise<{ count?: number }>) : null))
      .then((data) => {
        if (!cancelled && typeof data?.count === "number") setCount(data.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, preview, ctx.roomCode]);
  return preview ? previewCount : count;
}

function CollectionBanner({ count }: { count: number }) {
  return (
    <Link
      href="/collection"
      className="flex min-h-11 items-center gap-2 self-start rounded-full bg-shape-sage px-4 py-2.5 text-[15px] font-bold text-[#141414] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0">{`${count} new ${count === 1 ? "word" : "words"} in your collection`}</span>
      <ArrowRight aria-hidden className="size-[18px] shrink-0" />
    </Link>
  );
}

export function MatchEnd({ ctx }: { ctx: GameCtx }) {
  const newWords = useNewWords(ctx);
  const [sharing, setSharing] = React.useState(false);
  const youWon = ctx.you.score > ctx.them.score;
  const tied = ctx.you.score === ctx.them.score;
  const awards = matchAwards(ctx.used);
  // Winner yellow; the loser pink when you won, cream when you lost.
  // Cream is a literal: the phase tokens all turn near-black in dark mode,
  // and a dark flower under ink digits read 1.05:1.
  const yourFill = tied || youWon ? "var(--shape-yellow)" : "#f5f0e3";
  const theirFill = tied || !youWon ? "var(--shape-yellow)" : "var(--shape-pink)";

  React.useEffect(() => {
    playChime();
    // Confetti only for the local winner. Tied matches and losing-side
    // viewers get the chime + scoreboard but no party (avoids the
    // condescending "consolation confetti" pattern). Reduced-motion
    // viewers also opt out.
    if (tied || !youWon) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const burst = (origin: { x: number; y: number }, delay: number) => {
      const t = setTimeout(() => {
        confetti({
          particleCount: 90,
          spread: 70,
          startVelocity: 38,
          origin,
          ticks: 140,
        });
      }, delay);
      return t;
    };
    const t1 = burst({ x: 0.2, y: 0.7 }, 100);
    const t2 = burst({ x: 0.8, y: 0.7 }, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tied, youWon]);

  const primary = (
    <Button
      variant="pill"
      size="pill-lg"
      className="h-auto min-h-14 w-full py-3 whitespace-normal"
      // Referee (host, or the guest once the host has gone) can restart. A
      // rematch needs both players, so it's disabled while the other side
      // is away rather than silently starting a lobby nobody is in.
      disabled={!ctx.meIsReferee || !ctx.opponentOnline}
      onClick={() => {
        if (!ctx.meIsReferee) return;
        if (ctx.actions.ready) {
          void ctx.actions.rematch();
        } else {
          ctx.setPhase("lobby");
        }
      }}
    >
      {!ctx.opponentOnline
        ? `Waiting for ${ctx.them.name} to come back…`
        : ctx.meIsReferee
          ? "Rematch"
          : `Waiting for ${ctx.hostName}…`}
    </Button>
  );

  return (
    <div className="wp-body">
      <div className="wp-frame lg:max-w-[1040px]">
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:[grid-template-areas:'main_table''cta_table']">
          <div className="flex min-w-0 flex-col gap-[18px] lg:[grid-area:main]">
            <h1 className="m-0 text-[44px] leading-[0.98] font-extrabold tracking-[-1.5px] [overflow-wrap:anywhere] lg:text-[56px]">
              {tied ? "Dead heat!" : youWon ? "You" : ctx.them.name}
              <br />
              <span className="font-hand text-[50px] font-normal tracking-normal lg:text-[64px]">
                {tied ? "nobody blinks" : youWon ? "pinched it!" : "pinched it, rematch?"}
              </span>
            </h1>

            <div className="flex items-center gap-4">
              <span className="lg:hidden">
                <ScoreFlower score={ctx.you.score} name={ctx.you.name} fill={yourFill} size={110} />
              </span>
              <span className="lg:hidden">
                <ScoreFlower score={ctx.them.score} name={ctx.them.name} fill={theirFill} size={110} />
              </span>
              <span className="hidden lg:block">
                <ScoreFlower score={ctx.you.score} name={ctx.you.name} fill={yourFill} size={130} />
              </span>
              <span className="hidden lg:block">
                <ScoreFlower score={ctx.them.score} name={ctx.them.name} fill={theirFill} size={130} />
              </span>
              {!tied && youWon ? (
                <div aria-hidden className="-rotate-4 font-hand text-2xl leading-[1.1]">
                  confetti
                  <br />
                  time!
                </div>
              ) : null}
            </div>

            {awards.fastest || awards.longest ? (
              <div className="grid grid-cols-2 gap-2.5">
                {awards.fastest ? <AwardCard icon={<Zap />} label="Fastest" award={awards.fastest} /> : null}
                {awards.longest ? <AwardCard icon={<MoveHorizontal />} label="Longest" award={awards.longest} /> : null}
              </div>
            ) : null}

            {newWords > 0 ? <CollectionBanner count={newWords} /> : null}
          </div>

          <div className="min-w-0 lg:self-start lg:[grid-area:table]">
            <RoundsTable ctx={ctx} />
          </div>

          <div className="flex flex-col gap-1 lg:self-start lg:[grid-area:cta]">
            {/* Share (white) beside the primary, as in the artboard; it
             *  needs a real room, so previews leave it out. */}
            {ctx.collection.preview || !ctx.roomCode ? (
              primary
            ) : (
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5">
                <Button variant="pill-soft" size="pill-lg" className="h-auto min-h-14 px-5" onClick={() => setSharing(true)}>
                  <Share2 aria-hidden />
                  Share
                </Button>
                {primary}
              </div>
            )}
            <LeaveLink />
          </div>
        </div>
      </div>
      {sharing ? (
        <ShareResultDialog
          open={sharing}
          onOpenChange={setSharing}
          roomCode={ctx.roomCode}
          alt={
            tied
              ? `Share card: ${ctx.hostName} and ${ctx.guestName} tied ${ctx.you.score} to ${ctx.them.score}`
              : `Share card: ${youWon ? ctx.you.name : ctx.them.name} beat ${youWon ? ctx.them.name : ctx.you.name} ${Math.max(ctx.you.score, ctx.them.score)} to ${Math.min(ctx.you.score, ctx.them.score)}`
          }
        />
      ) : null}
    </div>
  );
}

function LeaveLink() {
  return (
    <Link
      href="/"
      className="flex h-11 items-center self-center px-3 text-[15px] font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      Leave room
    </Link>
  );
}
