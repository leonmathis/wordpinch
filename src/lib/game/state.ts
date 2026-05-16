import type { GamePhase } from "./types";

/**
 * Persisted shape of a game room. Stored in `public.rooms.state` (jsonb).
 * Mirrors the in-memory `GameCtx` minus the display-only fields, plus
 * server-authoritative bits (settings, scores, pick).
 */
export type PersistedGameState = {
  phase: GamePhase;
  round: number;
  total: number;
  scores: { host: number; guest: number };
  settings: {
    rounds: number;
    roundTimerSec: number;
    minWordLength: number;
    tieBehavior: "replay" | "split" | "nobody";
    allowProperNouns: boolean;
    audioDefinitions: boolean;
    language: "en";
  };
  players: {
    host: { id: string; name: string } | null;
    guest: { id: string; name: string } | null;
  };
  pick: {
    hostLetter?: string;
    guestLetter?: string;
    firstPicker: "host" | "guest";
  };
  result?: {
    winner: "host" | "guest" | "split" | "none";
    word?: string;
    phonetic?: string;
    submittedAt?: number;
  };
  usedWords: {
    round: number;
    word: string;
    ipa: string;
    by: "host" | "guest" | "split";
  }[];
  createdAt: number;
};

/**
 * Returns a fresh `PersistedGameState` for a new room. The host is the player
 * who hit "Create new room"; the guest slot is empty until someone joins.
 */
export function initialGameState({
  hostId,
  hostName = "you",
}: {
  hostId: string;
  hostName?: string;
}): PersistedGameState {
  return {
    phase: "lobby",
    round: 0,
    total: 5,
    scores: { host: 0, guest: 0 },
    settings: {
      rounds: 5,
      roundTimerSec: 20,
      minWordLength: 3,
      tieBehavior: "replay",
      allowProperNouns: false,
      audioDefinitions: true,
      language: "en",
    },
    players: {
      host: { id: hostId, name: hostName },
      guest: null,
    },
    pick: { firstPicker: "host" },
    usedWords: [],
    createdAt: Date.now(),
  };
}
