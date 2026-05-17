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
    host: { name: string } | null;
    guest: { name: string } | null;
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
    /** Pronunciation audio URL (Free Dictionary API), if present. */
    audio?: string;
    definitions?: { partOfSpeech: string; definition: string; example?: string }[];
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
 *
 * NOTE: This function intentionally does NOT take `hostId`. The host's UUID is
 * the bearer token that authorizes state mutations and must NEVER appear in
 * the persisted state — it would otherwise leak to every reader of the room
 * (since GET /api/rooms/[code] returns the state). The UUID lives only in the
 * `rooms.host_id` column, which is redacted from API responses.
 */
export function initialGameState({
  hostName = "you",
}: {
  hostName?: string;
} = {}): PersistedGameState {
  return {
    phase: "lobby",
    round: 0,
    total: 5,
    scores: { host: 0, guest: 0 },
    settings: {
      rounds: 5,
      roundTimerSec: 60,
      minWordLength: 3,
      tieBehavior: "replay",
      allowProperNouns: false,
      audioDefinitions: true,
      language: "en",
    },
    players: {
      host: { name: hostName },
      guest: null,
    },
    pick: { firstPicker: "host" },
    usedWords: [],
    createdAt: Date.now(),
  };
}
