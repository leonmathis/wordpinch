import type { Player, UsedWord } from "./mock";

export type GamePhase =
  | "landing"
  | "lobby"
  | "pick"
  | "reveal"
  | "race"
  | "result"
  | "matchend"
  | "spectator";

export type GameCtx = {
  phase: GamePhase;
  setPhase: (p: GamePhase) => void;
  round: number;
  total: number;
  letterStart: string;
  letterEnd: string;
  word: string;
  ipa: string;
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
};
