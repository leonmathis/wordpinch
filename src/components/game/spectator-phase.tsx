"use client";

import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { LettersDisplay } from "./letters-display";

const RACE_INPUT_OVERRIDES =
  "race-input rounded-[var(--radius)] h-[96px] max-[500px]:h-[80px] w-full px-4 py-0 text-[48px] max-[500px]:text-[36px] md:text-[48px] bg-transparent dark:bg-transparent focus-visible:ring-0";

export function SpectatorPhase({ ctx }: { ctx: GameCtx }) {
  const A = ctx.letterStart;
  const B = ctx.letterEnd;

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
      <div className="spec-banner">
        Watching wordpinch — 2 players in game
      </div>
      <div className="wp-body" style={{ paddingTop: 76 }}>
        <div className="wp-frame scene">
          <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
            <LettersDisplay start={A} end={B} />
            <div className="font-mono tabular-nums" style={{ fontSize: 24 }}>
              14s
            </div>
          </div>

          <div className="race-input-wrap">
            <Input
              className={`${RACE_INPUT_OVERRIDES} opacity-50`}
              disabled
              value=""
              placeholder={`${A}${"_".repeat(3)}${B}`}
              readOnly
              aria-label="Spectator view"
            />
            <div className="race-progress" style={{ width: "70%" }} />
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <div className="t-label flex items-center" style={{ gap: 8 }}>
              <span
                className="wp-dot pulse-soft"
                style={{ background: "var(--muted-foreground)" }}
              />
              <span>{ctx.you.name} typing</span>
            </div>
            <div className="t-label flex items-center" style={{ gap: 8 }}>
              <span>{ctx.them.name} typing</span>
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
      </div>
    </>
  );
}
