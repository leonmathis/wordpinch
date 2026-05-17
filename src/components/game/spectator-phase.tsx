"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { LettersDisplay } from "./letters-display";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye } from "lucide-react";

const RACE_INPUT_OVERRIDES =
  "race-input rounded-[var(--radius)] h-[96px] max-[500px]:h-[80px] w-full px-4 py-0 text-[48px] max-[500px]:text-[36px] md:text-[48px] bg-transparent dark:bg-transparent focus-visible:ring-0";

function Banner() {
  return (
    <div className="absolute left-0 right-0 z-[3] flex justify-center px-4 pointer-events-none" style={{ top: 12 }}>
      <Alert className="max-w-sm backdrop-blur-sm bg-background/85 shadow-sm">
        <Eye />
        <AlertDescription>
          Watching wordpinch — 2 players in game
        </AlertDescription>
      </Alert>
    </div>
  );
}

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

function SpectatorLobby({ ctx }: { ctx: GameCtx }) {
  return (
    <div className="wp-frame scene">
      <div className="room-code" style={{ textAlign: "center", marginBottom: 24 }}>
        {ctx.roomCode}
      </div>
      <div className="t-label-up" style={{ marginBottom: 8 }}>
        Players
      </div>
      <Separator />
      <div className="players-row">
        <span>
          {ctx.hostName} <span className="t-label">(host)</span>
        </span>
      </div>
      <Separator />
      <div className="players-row">
        <span>{ctx.guestName}</span>
      </div>
      <Separator />
      <div
        className="t-label text-center"
        style={{ marginTop: 24 }}
      >
        Match hasn&apos;t started yet
      </div>
    </div>
  );
}

function SpectatorPick({ ctx }: { ctx: GameCtx }) {
  return (
    <div className="wp-frame scene" style={{ alignItems: "center" }}>
      <div
        className="t-label-up"
        style={{ marginBottom: 32 }}
      >
        Round {ctx.round} of {ctx.total}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        Players are picking their letters…
      </div>
      <ScoreHud
        you={ctx.you}
        them={ctx.them}
        used={ctx.used.slice(0, ctx.round - 1)}
      />
    </div>
  );
}

function SpectatorReveal({ ctx }: { ctx: GameCtx }) {
  // A spectator joining mid-reveal won't see the full 3-2-1-GO sync because
  // the countdown runs on its own client clock; just show the letters once
  // they're available in state.
  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  const gaps = Math.max(0, ctx.minWordLength - 2);
  return (
    <div className="wp-frame scene" style={{ alignItems: "center" }}>
      <div
        className="t-label-up"
        style={{ marginBottom: 24 }}
      >
        Round {ctx.round} of {ctx.total}
      </div>
      {A && B ? (
        <LettersDisplay start={A} end={B} variant="template" animated gaps={gaps} />
      ) : (
        <div className="countdown">3 · 2 · 1</div>
      )}
    </div>
  );
}

function SpectatorRace({ ctx }: { ctx: GameCtx }) {
  const A = ctx.letterStart;
  const B = ctx.letterEnd;
  const gaps = Math.max(0, ctx.minWordLength - 2);
  const total = ctx.roundTimerSec || 60;
  const left = useRaceClock(total, ctx.raceStartedAt);
  const pct = total > 0 ? (left / total) * 100 : 0;

  return (
    <div className="wp-frame scene">
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 22 }}
      >
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

      <div className="race-input-wrap">
        <Input
          className={`${RACE_INPUT_OVERRIDES} opacity-50`}
          disabled
          value=""
          placeholder={`${A}${"_".repeat(gaps)}${B}`}
          readOnly
          aria-label="Spectator view"
        />
        <div className="race-progress" style={{ width: `${pct}%` }} />
      </div>

      <div
        className="flex items-center justify-between"
        style={{ marginTop: 14 }}
      >
        <div className="t-label flex items-center" style={{ gap: 8 }}>
          <span
            className="wp-dot pulse-soft"
            style={{ background: "var(--muted-foreground)" }}
          />
          <span>{ctx.hostName} typing</span>
        </div>
        <div className="t-label flex items-center" style={{ gap: 8 }}>
          <span>{ctx.guestName} typing</span>
          <span
            className="wp-dot pulse-soft"
            style={{ background: "var(--muted-foreground)" }}
          />
        </div>
      </div>

      <ScoreHud
        you={ctx.you}
        them={ctx.them}
        used={ctx.used.slice(0, ctx.round - 1)}
      />
    </div>
  );
}

function SpectatorResult({ ctx }: { ctx: GameCtx }) {
  const isTimeout = ctx.winner === "none";
  return (
    <div className="wp-frame scene" style={{ alignItems: "center" }}>
      <div
        className="t-label-up"
        style={{ marginBottom: 12 }}
      >
        Round {ctx.round} of {ctx.total}
      </div>
      {isTimeout ? (
        <div style={{ fontSize: 28, fontWeight: 500 }}>No winner this round</div>
      ) : (
        <>
          <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.02em" }}>
            {ctx.word}
          </div>
          {ctx.ipa ? (
            <div
              className="font-mono italic text-muted-foreground"
              style={{ fontSize: 18, marginTop: 6 }}
            >
              {ctx.ipa}
            </div>
          ) : null}
        </>
      )}
      <ScoreHud
        you={ctx.you}
        them={ctx.them}
        used={ctx.used.slice(0, ctx.round)}
      />
    </div>
  );
}

function SpectatorMatchEnd({ ctx }: { ctx: GameCtx }) {
  const hostWon = ctx.you.score > ctx.them.score;
  const tie = ctx.you.score === ctx.them.score;
  return (
    <div className="wp-frame scene" style={{ alignItems: "center" }}>
      <div className="t-label-up" style={{ marginBottom: 12 }}>
        Match
      </div>
      <div style={{ fontSize: 32, fontWeight: 500 }}>
        {tie
          ? "Tied match"
          : hostWon
          ? `${ctx.hostName} wins`
          : `${ctx.guestName} wins`}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: 18, marginTop: 8, color: "var(--muted-foreground)" }}
      >
        {ctx.you.score} · {ctx.them.score}
      </div>
    </div>
  );
}

/**
 * Read-only view rendered for any client whose role resolves to 'spectator'.
 * The inner content switches on the active game phase so a spectator who
 * joins mid-match sees what's actually happening rather than a generic
 * "watching..." placeholder.
 */
export function SpectatorPhase({ ctx }: { ctx: GameCtx }) {
  return (
    <>
      <TopChrome
        round={ctx.round}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
        showBrand={false}
      />
      <Banner />
      <div className="wp-body" style={{ paddingTop: 76 }}>
        {ctx.phase === "lobby" ? <SpectatorLobby ctx={ctx} /> : null}
        {ctx.phase === "pick" ? <SpectatorPick ctx={ctx} /> : null}
        {ctx.phase === "reveal" ? <SpectatorReveal ctx={ctx} /> : null}
        {ctx.phase === "race" ? <SpectatorRace ctx={ctx} /> : null}
        {ctx.phase === "result" ? <SpectatorResult ctx={ctx} /> : null}
        {ctx.phase === "matchend" ? <SpectatorMatchEnd ctx={ctx} /> : null}
      </div>
    </>
  );
}
