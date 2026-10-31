import type { RoomActions } from "./actions";
import type { PersistedGameState } from "./state";
import type { Incoming } from "../room-fx";
import type { ReactionId } from "./reactions";

/** Display shape for a player slot in the UI. Server stores only `name`
 *  (in state.players), but the UI thinks in name+score pairs. */
export type Player = { name: string; score: number };

/** A row in the per-round word log. `by` is the display *name* of the
 *  player who submitted this word (or "split" for legacy entries). */
export type UsedWord = {
  round: number;
  word: string;
  ipa: string;
  by: string;
  /**
   * Which seat played the word. The match-end summary groups by this rather
   * than by `by` (a display name), so two players who happen to choose the
   * same name don't collapse into one column.
   */
  bySide: "host" | "guest" | "split";
  /** Time from raceStartedAt to submission, in ms. Shown as "x.x s" in
   *  the match-end summary cells; absent for entries pre-dating the
   *  field. */
  timeMs?: number;
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
  /**
   * Which seat the local viewer holds, or null for spectators. Needed by
   * the forfeit path, which awards the round to whoever is still here.
   */
  mySide: "host" | "guest" | null;
  /**
   * True when this client is the one driving phase transitions (reveal →
   * race, timeout, next round, forfeit). Normally the host; the guest
   * takes over once the host has been absent from presence for a few
   * seconds, so a host who closes their tab can no longer freeze the
   * remaining player's game forever.
   */
  meIsReferee: boolean;
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
  /** Per-player attempts captured during a sim tie OR appended within
   *  the near-miss window after a solo win. Used by the result phase to
   *  render both submissions side-by-side and (for near-miss) compute a
   *  "won by N ms" timing diff. */
  resultAttempts?: {
    by: "host" | "guest";
    word: string;
    ipa?: string;
    submittedAt: number;
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
  /**
   * True once the server has registered the opponent's word for this round
   * (their attempt is sitting in `pendingResult`). Replaces the old
   * hard-coded "…is typing" line, which claimed activity the app had no
   * signal for — and kept claiming it while the disconnect banner said the
   * same player had left.
   */
  opponentSubmitted: boolean;
  /**
   * Per-seat status by role, for views that show both players at once (the
   * spectator race): online from presence (assumed until the first sync),
   * submitted from `pendingResult`.
   */
  seats: Record<"host" | "guest", { online: boolean; submitted: boolean }>;
  /** Everyone subscribed to the room, players included; null before sync. */
  watchers: number | null;
  used: UsedWord[];
  /**
   * How each finished round ended. Lets the match-end summary label rounds
   * that produced no word (forfeit, timeout, tie) instead of showing an
   * empty row next to a score that went up anyway.
   */
  roundOutcomes: NonNullable<PersistedGameState["rounds"]>;
  roomCode: string;
  /**
   * F2 word collection. `enabled` when this viewer can keep words: a
   * seated player with an anonymous account (legacy clientId players and
   * spectators have no collection). In a dev preview nothing is sent;
   * `previewCount` stands in for the match-end banner's count.
   */
  collection: { enabled: boolean; preview: boolean; previewCount: number };
  /**
   * F3 reactions, cheers and letter counts (`lib/room-fx.ts`). Cosmetic:
   * `incoming` is the latest reaction or cheer from someone else, `lens`
   * the current round's letter count per seat (null until reported).
   */
  /** F4: letters picked earlier this match, when "No repeat letters" is on. */
  blocked: ReadonlySet<string>;
  /** F4 peek: whether the rule is on, and the round this player spent it in. */
  peek: { on: boolean; spentRound: number | null };
  fx: {
    incoming: Incoming | null;
    lens: Record<"host" | "guest", number | null>;
    react: (id: ReactionId) => void;
    typing: (len: number) => void;
  };
  shareOpen: boolean;
  reconnectOpen: boolean;
  openShare: () => void;
  closeShare: () => void;
  muted: boolean;
  toggleMute: () => void;
  sceneKey: string;
  /** Server-authoritative actions. `ready` is false on landing or pre-state. */
  actions: RoomActions;
  /**
   * Race-phase signals that a word submission is in-flight so the parent
   * can hold the race-phase override active even after the live state
   * has flipped to `result`. This avoids the "you lost" flash on the
   * loser's screen before their near-miss attempt is appended — the
   * result phase only mounts once the submitter knows their final
   * outcome. `word` is shown on the settling screen ("You played …").
   */
  setSubmitInFlight: (b: boolean, word?: string) => void;
};
