import type { GamePhase } from "./types";

/**
 * Persisted shape of a game room. Stored in `public.rooms.state` (jsonb).
 * Mirrors the in-memory `GameCtx` minus the display-only fields, plus
 * server-authoritative bits (settings, scores, pick).
 */
export type PersistedGameState = {
  phase: GamePhase;
  round: number;
  /**
   * @deprecated use `settings.rounds` instead. Kept on the type for backward
   * compat with rows seeded before settings was the source of truth; new
   * writers should not set this field.
   */
  total?: number;
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
    /**
     * Discriminator for results that lack a winning word.
     *   "timeout"     — race timer expired (winner reflects tieBehavior:
     *                   'none' for nobody, 'split' for split).
     *   "tied_nobody" — both submitted simultaneously, tieBehavior="nobody"
     *                   (winner: "none").
     *   "forfeit"     — opponent stayed disconnected through the grace
     *                   period; round awarded to the present player
     *                   (winner: "host" | "guest", no word).
     * Absent for normal single-winner or sim-tie-split outcomes (which
     * always carry a `word`).
     */
    reason?: "timeout" | "tied_nobody" | "forfeit";
    word?: string;
    phonetic?: string;
    /** Pronunciation audio URL (Free Dictionary API), if present. */
    audio?: string;
    definitions?: { partOfSpeech: string; definition: string; example?: string }[];
    submittedAt?: number;
  };
  /**
   * Active submissions during the 200ms tie window between the first
   * submission landing and the resolver firing. Cleared by the resolver
   * when it writes phase='result' (or 'pick' for replay tie behavior).
   * Presence of this field implies a race resolution is imminent.
   */
  pendingResult?: {
    attempts: {
      by: "host" | "guest";
      word: string;
      phonetic?: string;
      audio?: string;
      definitions?: { partOfSpeech: string; definition: string; example?: string }[];
      submittedAt: number;
    }[];
  };
  /**
   * ms-epoch when the race phase started for the current round. Persists in
   * the row so a refresh / rejoin computes remaining time correctly instead
   * of starting fresh at `settings.roundTimerSec`.
   */
  raceStartedAt?: number;
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
