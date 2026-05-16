"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { GameCtx, GamePhase } from "@/lib/game/types";
import { MOCK } from "@/lib/game/mock";
import { useStoredBool } from "@/lib/hooks";
import { Landing } from "./landing";
import { Lobby } from "./lobby";
import { PickPhase } from "./pick-phase";
import { RevealPhase } from "./reveal-phase";
import { RacePhase } from "./race-phase";
import { ResultPhase } from "./result-phase";
import { MatchEnd } from "./match-end";
import { SpectatorPhase } from "./spectator-phase";
import { ReconnectBanner } from "./reconnect-banner";

const ShareDialog = dynamic(
  () => import("./share-dialog").then((m) => ({ default: m.ShareDialog })),
  { ssr: false }
);

type Props = {
  initialPhase?: GamePhase;
  roomCode?: string;
  showReconnect?: boolean;
};

const VALID_PHASES: GamePhase[] = [
  "landing",
  "lobby",
  "pick",
  "reveal",
  "race",
  "result",
  "matchend",
  "spectator",
];

export function WordpinchUI({
  initialPhase = "lobby",
  roomCode,
  showReconnect = false,
}: Props) {
  const [phase, setPhase] = React.useState<GamePhase>(initialPhase);
  const [muted, setMutedStored] = useStoredBool("muted");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [simulateReject, setSimulateReject] = React.useState(0);

  const toggleMute = React.useCallback(() => {
    setMutedStored(!muted);
  }, [muted, setMutedStored]);

  const openShare = React.useCallback(() => setShareOpen(true), []);
  const closeShare = React.useCallback(() => setShareOpen(false), []);

  const sceneKey = React.useMemo(
    () => `${phase}-${MOCK.round}-${simulateReject}`,
    [phase, simulateReject]
  );

  const ctx: GameCtx = React.useMemo(
    () => ({
      phase,
      setPhase,
      round: MOCK.round,
      total: MOCK.total,
      letterStart: MOCK.letterStart,
      letterEnd: MOCK.letterEnd,
      word: MOCK.word,
      ipa: MOCK.ipa,
      you: MOCK.you,
      them: MOCK.them,
      used: MOCK.used,
      roomCode: roomCode ?? MOCK.roomCode,
      url: MOCK.url,
      shareOpen,
      reconnectOpen: showReconnect,
      openShare,
      closeShare,
      muted,
      toggleMute,
      simulateReject,
      sceneKey,
    }),
    [
      phase,
      shareOpen,
      showReconnect,
      muted,
      toggleMute,
      simulateReject,
      sceneKey,
      roomCode,
      openShare,
      closeShare,
    ]
  );

  const showShare = shareOpen && phase !== "landing";

  return (
    <div className="wp-root" data-room={ctx.roomCode}>
      {ctx.reconnectOpen ? <ReconnectBanner /> : null}

      {phase === "landing" ? <Landing key={sceneKey} ctx={ctx} /> : null}
      {phase === "lobby" ? <Lobby key={sceneKey} ctx={ctx} /> : null}
      {phase === "pick" ? <PickPhase key={sceneKey} ctx={ctx} /> : null}
      {phase === "reveal" ? <RevealPhase key={sceneKey} ctx={ctx} /> : null}
      {phase === "race" ? <RacePhase key={sceneKey} ctx={ctx} /> : null}
      {phase === "result" ? <ResultPhase key={sceneKey} ctx={ctx} /> : null}
      {phase === "matchend" ? <MatchEnd key={sceneKey} ctx={ctx} /> : null}
      {phase === "spectator" ? <SpectatorPhase key={sceneKey} ctx={ctx} /> : null}

      {showShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          roomCode={ctx.roomCode}
          url={ctx.url}
        />
      ) : null}

      {process.env.NODE_ENV === "development" ? (
        <DevPhaseNav phase={phase} setPhase={setPhase} setSimulateReject={setSimulateReject} />
      ) : null}
    </div>
  );
}

function DevPhaseNav({
  phase,
  setPhase,
  setSimulateReject,
}: {
  phase: GamePhase;
  setPhase: (p: GamePhase) => void;
  setSimulateReject: (n: number) => void;
}) {
  return (
    <div
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 flex flex-wrap gap-1 px-3 py-1.5 rounded-full font-mono pointer-events-auto"
      style={{
        fontSize: 11,
        background: "color-mix(in oklch, var(--foreground) 6%, transparent)",
        border: "1px solid var(--border)",
      }}
    >
      {VALID_PHASES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPhase(p)}
          className="px-2 py-0.5 rounded-full transition-colors"
          style={{
            background: phase === p ? "var(--foreground)" : "transparent",
            color: phase === p ? "var(--background)" : "var(--muted-foreground)",
          }}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setSimulateReject(Math.random())}
        className="px-2 py-0.5 rounded-full transition-colors text-muted-foreground hover:text-foreground"
        title="Simulate rejected word (race phase)"
      >
        ✗
      </button>
    </div>
  );
}
