import type { RoomActions } from "./actions";
import type { PersistedGameState } from "./state";

/** Display shape for a player slot in the UI. Server stores only `name`
 *  (in state.players), but the UI thinks in name+score pairs. */
export type Player = { name: string; score: number };

/** A row in the "Words played" history. `by` is the display name of the
 *  player who won the round (or "split" for tie outcomes). */
export type UsedWord = {
  round: number;
  word: string;
  ipa: string;
  by: string;
};

export type GamePhase =
  | "landing"
  | "lobby"
  | "pick"
  | "reveal"
  | "race"
  | "result"
  | "matchend"
  | "spectator";

export type Definition = {
  partOfSpeech: string;
  definition: string;
  example?: string;
};

export type GameCtx = {
  phase: GamePhase;
  setPhase: (p: GamePhase) => void;
  round: number;
  total: number;
  /** Full settings object. Most consumers should read individual fields below. */
  settings: PersistedGameState["settings"];
  roundTimerSec: number;
  minWordLength: number;
  /** Whose turn it is to set the *first* letter this round. */
  firstPicker: "host" | "guest";
  /** ms-epoch when the race started this round; undefined outside race phase. */
  raceStartedAt?: number;
  /**
   * Whether the local player is the host. Phase 6: always true once we have
   * a roomCode. Phase 7 will read this from a server role-resolution call.
   */
  meIsHost: boolean;
  letterStart: string;
  letterEnd: string;
  word: string;
  ipa: string;
  /** Pronunciation audio URL (Free Dictionary API), if any. */
  audio?: string;
  /** Definitions for the round-winning word (from validate API). */
  definitions: Definition[];
  /** Winner of the most recently completed round. */
  winner?: "host" | "guest" | "split" | "none";
  /** Why a round ended without a winning word, or why the round needs
   *  special UI handling. See PersistedGameState for the canonical
   *  definition. */
  resultReason?: "timeout" | "tied_nobody" | "forfeit" | "replay_pending";
  /** Per-player attempts captured during a sim tie. Populated for split
   *  + replay_pending; used by the result phase to render both
   *  submissions side-by-side. */
  resultAttempts?: {
    by: "host" | "guest";
    word: string;
    ipa?: string;
  }[];
  /** Caller-relative: `you` is whoever the local viewer is. */
  you: Player;
  them: Player;
  /** Canonical (non-flipped) display names. Used by surfaces that label by
   *  role rather than viewer perspective (e.g. lobby roster). */
  hostName: string;
  guestName: string;
  /**
   * True once a player has claimed the guest slot via /join (state.players
   * .guest is non-null). Lobby uses this to swap the fallback "guest"
   * placeholder name for a "waiting…" state.
   */
  guestPresent: boolean;
  /**
   * Presence of the opponent (the *other* player slot, not the caller).
   * Derived from the channel's presence sync. While `false` during race
   * phase, the timer pauses locally; if it stays false for 10 s the host's
   * client triggers `forfeitRound`. For spectators this is always `true`
   * (they have no opponent).
   */
  opponentOnline: boolean;
  used: UsedWord[];
  roomCode: string;
  shareOpen: boolean;
  reconnectOpen: boolean;
  openShare: () => void;
  closeShare: () => void;
  muted: boolean;
  toggleMute: () => void;
  sceneKey: string;
  /** Server-authoritative actions. `ready` is false on landing or pre-state. */
  actions: RoomActions;
};
