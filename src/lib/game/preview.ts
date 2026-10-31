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
  /** Opponent dropped out of presence (`?away=1`). */
  away: boolean;
  /** Opponent's word is in and being checked (`?opp=submitted`). */
  oppSubmitted: boolean;
  /** Your own word is in: the settling screen (`?settling=1`). */
  settling: boolean;
};

export function parsePreview(
  phase: GamePhase,
  sp: { as?: string; guest?: string; stress?: string; away?: string; opp?: string; settling?: string }
): PreviewOpts | null {
  if (sp.as !== "host" && sp.as !== "guest") return null;
  return {
    phase,
    as: sp.as,
    // A guest viewer implies a taken guest seat.
    guest: sp.as === "guest" || sp.guest !== "0",
    stress: sp.stress === "1",
    away: sp.away === "1",
    oppSubmitted: sp.opp === "submitted",
    settling: sp.settling === "1",
  };
}

export function previewState(opts: PreviewOpts): PersistedGameState {
  const hostName = opts.stress ? "Maximiliana Wolkenstein-Haberma" : "Leon";
  const guestName = opts.stress ? "Juno Bartholomew Featherstonehau" : "Juno";
  const base = initialGameState({ hostName });
  const inMatch = opts.phase !== "lobby";
  return {
    ...base,
    phase: opts.phase,
    settings: { ...base.settings, rounds: 7, roundTimerSec: 30, minWordLength: 4 },
    players: { host: { name: hostName }, guest: opts.guest ? { name: guestName } : null },
    // Mid-match from pick on: round 3 of 7, host leads 2–1.
    ...(inMatch
      ? {
          round: 3,
          scores: { host: 2, guest: 1 },
          rounds: [
            { round: 1, winner: "host" as const },
            { round: 2, winner: "guest" as const },
          ],
          pick: { hostLetter: "T", guestLetter: "H", firstPicker: "host" as const },
          ...(opts.oppSubmitted || opts.settling
            ? {
                pendingResult: {
                  attempts: [
                    {
                      by: opts.settling ? opts.as : opts.as === "host" ? ("guest" as const) : ("host" as const),
                      word: opts.stress ? "thoroughbreedsmith" : "tooth",
                      submittedAt: 0,
                    },
                  ],
                },
              }
            : {}),
          usedWords: [
            { round: 1, word: "glove", ipa: "/ɡlʌv/", by: "host" as const, timeMs: 8_400 },
            { round: 2, word: opts.stress ? "uncharacteristically" : "plank", ipa: "", by: "guest" as const, timeMs: 12_100 },
          ],
        }
      : {}),
  };
}
