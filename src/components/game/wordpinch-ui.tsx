"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { GameCtx, GamePhase } from "@/lib/game/types";
import type { PersistedGameState } from "@/lib/game/state";
import { MOCK } from "@/lib/game/mock";
import { useRoomActions } from "@/lib/game/actions";
import { useStoredBool, useClientId } from "@/lib/hooks";
import { useRoomChannel } from "@/lib/use-room-channel";
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
  initialState?: PersistedGameState | null;
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
  initialState = null,
  showReconnect = false,
}: Props) {
  const clientId = useClientId();
  const [muted, setMutedStored] = useStoredBool("muted");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [simulateReject, setSimulateReject] = React.useState(0);
  const [localPhase, setLocalPhase] = React.useState<GamePhase>(initialPhase);

  // Subscribe to the room's Realtime channel. Skipped when there's no room
  // (landing) or no clientId yet (pre-hydration).
  const channelCode = roomCode && clientId ? roomCode : null;
  const { state: liveState, status: channelStatus } = useRoomChannel({
    code: channelCode,
    clientId: clientId || "00000000-0000-0000-0000-000000000000",
    initialState,
  });

  const actions = useRoomActions({
    code: channelCode,
    clientId,
    state: liveState,
  });

  const toggleMute = React.useCallback(() => {
    setMutedStored(!muted);
  }, [muted, setMutedStored]);

  const openShare = React.useCallback(() => setShareOpen(true), []);
  const closeShare = React.useCallback(() => setShareOpen(false), []);

  // Phase: prefer server state when we have it; otherwise fall back to the
  // URL / internal phase. Dev phase strip can override via setLocalPhase.
  const phase: GamePhase = liveState?.phase ?? localPhase;

  const round = liveState?.round
    ?? (!roomCode ? MOCK.round : 0);
  const total = liveState?.total
    ?? (!roomCode ? MOCK.total : 5);
  const roundTimerSec = liveState?.settings?.roundTimerSec ?? 60;
  const letterStart = liveState?.pick?.hostLetter
    ?? (!roomCode ? MOCK.letterStart : "");
  const letterEnd = liveState?.pick?.guestLetter
    ?? (!roomCode ? MOCK.letterEnd : "");
  // Limit MOCK fallbacks to the landing-only preview. In a real room we want
  // genuine empty state to flow through instead of MOCK leaking in.
  const isPreviewOnly = !roomCode;
  const resultWord = liveState?.result?.word?.toUpperCase()
    ?? (isPreviewOnly ? MOCK.word : "");
  const resultIpa = liveState?.result?.phonetic
    ?? (isPreviewOnly ? MOCK.ipa : "");
  const resultAudio = liveState?.result?.audio;
  const resultDefs = React.useMemo(
    () => liveState?.result?.definitions ?? [],
    [liveState?.result?.definitions]
  );
  const winner = liveState?.result?.winner;
  const hostScore = liveState?.scores?.host ?? (!roomCode ? MOCK.you.score : 0);
  const guestScore = liveState?.scores?.guest ?? (!roomCode ? MOCK.them.score : 0);
  const hostName = liveState?.players?.host?.name
    ?? (!roomCode ? MOCK.you.name : "you");
  const guestName = liveState?.players?.guest?.name
    ?? (!roomCode ? MOCK.them.name : "guest");
  const liveUsedWords = liveState?.usedWords;
  const usedWords = React.useMemo(
    () =>
      liveUsedWords && liveUsedWords.length > 0
        ? liveUsedWords.map((u) => ({
            round: u.round,
            word: u.word,
            ipa: u.ipa,
            by: u.by === "host" ? hostName : u.by === "guest" ? guestName : "split",
          }))
        : !roomCode
        ? MOCK.used
        : [],
    [liveUsedWords, hostName, guestName, roomCode]
  );

  const sceneKey = React.useMemo(
    () => `${phase}-${round}-${simulateReject}`,
    [phase, round, simulateReject]
  );

  const reconnectOpen =
    showReconnect ||
    (!!roomCode && (channelStatus === "reconnecting" || channelStatus === "closed"));

  const ctx: GameCtx = React.useMemo(
    () => ({
      phase,
      setPhase: setLocalPhase,
      round,
      total,
      roundTimerSec,
      letterStart,
      letterEnd,
      word: resultWord,
      ipa: resultIpa,
      audio: resultAudio,
      definitions: resultDefs,
      winner,
      you: { ...MOCK.you, name: hostName, score: hostScore },
      them: { ...MOCK.them, name: guestName, score: guestScore },
      used: usedWords,
      roomCode: roomCode ?? MOCK.roomCode,
      url: MOCK.url,
      shareOpen,
      reconnectOpen,
      openShare,
      closeShare,
      muted,
      toggleMute,
      simulateReject,
      sceneKey,
      actions,
    }),
    [
      phase,
      round,
      total,
      roundTimerSec,
      letterStart,
      letterEnd,
      resultWord,
      resultIpa,
      resultAudio,
      resultDefs,
      winner,
      hostName,
      hostScore,
      guestName,
      guestScore,
      usedWords,
      shareOpen,
      reconnectOpen,
      muted,
      toggleMute,
      simulateReject,
      sceneKey,
      roomCode,
      openShare,
      closeShare,
      actions,
    ]
  );

  const showShare = shareOpen && phase !== "landing";

  return (
    <div className="wp-root" data-room={ctx.roomCode}>
      {reconnectOpen ? <ReconnectBanner /> : null}

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
        <DevPhaseNav phase={phase} setPhase={setLocalPhase} setSimulateReject={setSimulateReject} />
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
