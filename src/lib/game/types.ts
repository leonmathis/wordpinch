import type { Player, UsedWord } from "./mock";
import type { RoomActions } from "./actions";
import type { PersistedGameState } from "./state";

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
  you: Player;
  them: Player;
  used: UsedWord[];
  roomCode: string;
  url: string;
  shareOpen: boolean;
  reconnectOpen: boolean;
  openShare: () => void;
  closeShare: () => void;
  muted: boolean;
  toggleMute: () => void;
  simulateReject: number;
  sceneKey: string;
  /** Server-authoritative actions. `ready` is false on landing or pre-state. */
  actions: RoomActions;
};
