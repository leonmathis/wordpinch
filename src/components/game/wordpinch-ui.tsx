"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { GameCtx, GamePhase } from "@/lib/game/types";
import type { PersistedGameState } from "@/lib/game/state";
import { MOCK } from "@/lib/game/mock";
import { useRoomActions } from "@/lib/game/actions";
import { useStoredBool, useClientId, useStoredString } from "@/lib/hooks";
import { useRoomChannel } from "@/lib/use-room-channel";
import { useMyRole } from "@/lib/use-my-role";
import { AnimatePresence } from "motion/react";
import { Landing } from "./landing";
import { Lobby } from "./lobby";
import { PickPhase } from "./pick-phase";
import { RevealPhase } from "./reveal-phase";
import { RacePhase } from "./race-phase";
import { ResultPhase } from "./result-phase";
import { MatchEnd } from "./match-end";
import { SpectatorPhase } from "./spectator-phase";
import { ReconnectBanner } from "./reconnect-banner";
import { PhaseShell } from "./phase-shell";
import { TopChrome } from "./top-chrome";

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

export function WordpinchUI({
  initialPhase = "lobby",
  roomCode,
  initialState = null,
  showReconnect = false,
}: Props) {
  const clientId = useClientId();
  const [storedName] = useStoredString("name");
  const [muted, setMutedStored] = useStoredBool("muted");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [localPhase, setLocalPhase] = React.useState<GamePhase>(initialPhase);

  // Resolve role (host / guest / spectator) before anything else. While
  // resolving, treat the caller as "not the host" so we don't briefly show
  // host-only UI (Start, settings edit, etc.) to a joining guest.
  const channelCode = roomCode && clientId ? roomCode : null;
  const { role } = useMyRole({
    code: channelCode,
    clientId,
    name: storedName,
  });

  const {
    state: liveState,
    status: channelStatus,
    presence,
    presenceReady,
  } = useRoomChannel({
    code: channelCode,
    clientId: clientId || "00000000-0000-0000-0000-000000000000",
    name: storedName.trim() || undefined,
    role: role ?? undefined,
    initialState,
  });

  // Derive opponent presence from the channel's presence sync. Default to
  // online until the first sync arrives — `presence` is `[]` during the
  // initial 100–500 ms subscription negotiation, which would otherwise
  // flash the "opponent disconnected" banner. Spectators never have an
  // opponent so the value is locked true for them.
  const opponentRole =
    role === "host" ? "guest" : role === "guest" ? "host" : null;
  const opponentOnline = !opponentRole
    ? true
    : !presenceReady
    ? true
    : presence.some((m) => m.role === opponentRole);

  const actions = useRoomActions({
    code: channelCode,
    clientId,
    state: liveState,
    role,
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
  // settings.rounds is the source of truth; state.total is legacy / fallback.
  const total = liveState?.settings?.rounds
    ?? liveState?.total
    ?? (!roomCode ? MOCK.total : 5);
  const liveSettings = liveState?.settings;
  const settings = React.useMemo(
    () =>
      liveSettings ?? {
        rounds: 5,
        roundTimerSec: 60,
        minWordLength: 3,
        tieBehavior: "replay" as const,
        allowProperNouns: false,
        audioDefinitions: true,
        language: "en" as const,
      },
    [liveSettings]
  );
  const roundTimerSec = settings.roundTimerSec;
  const minWordLength = settings.minWordLength;
  const firstPicker = liveState?.pick?.firstPicker ?? "host";
  const raceStartedAt = liveState?.raceStartedAt;
  const hostLetter = liveState?.pick?.hostLetter;
  const guestLetter = liveState?.pick?.guestLetter;
  // letterStart = the firstPicker's letter; letterEnd = the other player's.
  // (Previously we hard-mapped hostLetter→start, which broke alternation.)
  const letterStart =
    (firstPicker === "host" ? hostLetter : guestLetter)
    ?? (!roomCode ? MOCK.letterStart : "");
  const letterEnd =
    (firstPicker === "host" ? guestLetter : hostLetter)
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
  const resultReason = liveState?.result?.reason;
  const hostScore = liveState?.scores?.host ?? (!roomCode ? MOCK.you.score : 0);
  const guestScore = liveState?.scores?.guest ?? (!roomCode ? MOCK.them.score : 0);
  const hostName = liveState?.players?.host?.name
    ?? (!roomCode ? MOCK.you.name : "you");
  const guestName = liveState?.players?.guest?.name
    ?? (!roomCode ? MOCK.them.name : "guest");
  // True when the server has someone in the guest slot — drives the lobby
  // empty-state ("waiting…") instead of showing a fake "guest · online"
  // pair before the second player has even opened the link.
  const guestPresent = !!liveState?.players?.guest;
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
    () => `${phase}-${round}`,
    [phase, round]
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
      settings,
      roundTimerSec,
      minWordLength,
      firstPicker,
      raceStartedAt,
      meIsHost: role === "host",
      letterStart,
      letterEnd,
      word: resultWord,
      ipa: resultIpa,
      audio: resultAudio,
      definitions: resultDefs,
      winner,
      resultReason,
      // "you" and "them" flip based on who the caller is so the score HUD
      // and "they're typing" labels read correctly from each side. Spectators
      // see host as "you" by convention (matches the landing/lobby seed).
      you:
        role === "guest"
          ? { ...MOCK.them, name: guestName, score: guestScore }
          : { ...MOCK.you, name: hostName, score: hostScore },
      them:
        role === "guest"
          ? { ...MOCK.you, name: hostName, score: hostScore }
          : { ...MOCK.them, name: guestName, score: guestScore },
      hostName,
      guestName,
      guestPresent,
      opponentOnline,
      used: usedWords,
      roomCode: roomCode ?? MOCK.roomCode,
      url: MOCK.url,
      shareOpen,
      reconnectOpen,
      openShare,
      closeShare,
      muted,
      toggleMute,
      sceneKey,
      actions,
    }),
    [
      phase,
      round,
      total,
      settings,
      roundTimerSec,
      minWordLength,
      firstPicker,
      raceStartedAt,
      role,
      letterStart,
      letterEnd,
      resultWord,
      resultIpa,
      resultAudio,
      resultDefs,
      winner,
      resultReason,
      hostName,
      hostScore,
      guestName,
      guestScore,
      guestPresent,
      opponentOnline,
      usedWords,
      shareOpen,
      reconnectOpen,
      muted,
      toggleMute,
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

      {/* Persistent across phase transitions so the progress bar + theme/
       *  mute/share icons don't flicker out during the AnimatePresence
       *  exit-then-enter window. Visibility props are derived from the
       *  current phase + role. */}
      <TopChrome
        round={ctx.round}
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
        showShare={phase !== "landing"}
        showBrand={role !== "spectator"}
      />

      {/* Spectator routing: any client whose role resolved to 'spectator'
       *  sees the read-only SpectatorPhase regardless of the underlying
       *  game phase, which switches its content based on ctx.phase.
       *  AnimatePresence with mode="wait" orchestrates exit-then-enter
       *  between phase changes; the key is unique per (phase, round) so
       *  the same phase across two rounds (e.g. pick) still animates. */}
      <AnimatePresence mode="wait" initial={false}>
        {role === "spectator" && phase !== "landing" ? (
          <PhaseShell key={`spec-${phase}-${round}`}>
            <SpectatorPhase ctx={ctx} />
          </PhaseShell>
        ) : phase === "landing" ? (
          <PhaseShell key="landing">
            <Landing />
          </PhaseShell>
        ) : phase === "lobby" ? (
          <PhaseShell key={`lobby-${round}`}>
            <Lobby ctx={ctx} />
          </PhaseShell>
        ) : phase === "pick" ? (
          <PhaseShell key={`pick-${round}`}>
            <PickPhase ctx={ctx} />
          </PhaseShell>
        ) : phase === "reveal" ? (
          <PhaseShell key={`reveal-${round}`}>
            <RevealPhase ctx={ctx} />
          </PhaseShell>
        ) : phase === "race" ? (
          <PhaseShell key={`race-${round}`}>
            <RacePhase ctx={ctx} />
          </PhaseShell>
        ) : phase === "result" ? (
          <PhaseShell key={`result-${round}`}>
            <ResultPhase ctx={ctx} />
          </PhaseShell>
        ) : phase === "matchend" ? (
          <PhaseShell key="matchend">
            <MatchEnd ctx={ctx} />
          </PhaseShell>
        ) : null}
      </AnimatePresence>

      {showShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          roomCode={ctx.roomCode}
        />
      ) : null}
    </div>
  );
}
