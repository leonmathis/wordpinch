import { initialGameState, type PersistedGameState } from "./state";
import type { GamePhase } from "./types";

/**
 * Dev-only design preview (`/r/K7QM?phase=…&as=host|guest`). Seeds a room
 * state and a seat without touching the network, so every view of a phase
 * can be rendered and tested. `stress` swaps in the longest names the
 * server accepts (32 characters).
 */
export type PreviewOpts = {
  phase: GamePhase;
  as: "host" | "guest";
  /** Whether the guest seat is taken. */
  guest: boolean;
  stress: boolean;
};

export function parsePreview(
  phase: GamePhase,
  sp: { as?: string; guest?: string; stress?: string }
): PreviewOpts | null {
  if (sp.as !== "host" && sp.as !== "guest") return null;
  return {
    phase,
    as: sp.as,
    // A guest viewer implies a taken guest seat.
    guest: sp.as === "guest" || sp.guest !== "0",
    stress: sp.stress === "1",
  };
}

export function previewState(opts: PreviewOpts): PersistedGameState {
  const hostName = opts.stress ? "Maximiliana Wolkenstein-Haberma" : "Leon";
  const guestName = opts.stress ? "Juno Bartholomew Featherstonehau" : "Juno";
  const base = initialGameState({ hostName });
  return {
    ...base,
    phase: opts.phase,
    settings: { ...base.settings, rounds: 7, roundTimerSec: 30, minWordLength: 4 },
    players: { host: { name: hostName }, guest: opts.guest ? { name: guestName } : null },
  };
}
