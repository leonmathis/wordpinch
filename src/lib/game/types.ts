import type { Player, UsedWord } from "./mock";
import type { RoomActions } from "./actions";

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
  roundTimerSec: number;
  letterStart: string;
  letterEnd: string;
  word: string;
  ipa: string;
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
