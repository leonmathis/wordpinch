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
  /** Round result variant (`?result=…`), for phase=result. */
  result: ResultVariant;
};

export const RESULT_VARIANTS = [
  "win",
  "nearmiss",
  "split",
  "splittimeout",
  "nobody",
  "nobodytimeout",
  "forfeit",
  "replay",
] as const;
export type ResultVariant = (typeof RESULT_VARIANTS)[number];

const RACE_START = 1_000_000;
const TOOTH = {
  phonetic: "/tuːθ/",
  definitions: [
    {
      partOfSpeech: "noun",
      definition: "One of the hard white structures in the mouth, used for biting and chewing.",
      example: "She chipped a tooth on the ice.",
    },
  ],
};

/** Round 3's result and the scores after it, host = Leon. */
function resultFor(v: ResultVariant, stress: boolean): Pick<PersistedGameState, "result" | "scores"> {
  const word = stress ? "thoroughbredsmith" : "tooth";
  const at = (by: "host" | "guest", w: string, ms: number) => ({ by, word: w, submittedAt: RACE_START + ms });
  switch (v) {
    case "win":
      return { scores: { host: 3, guest: 1 }, result: { winner: "host", word, ...TOOTH, attempts: [at("host", word, 2400)] } };
    case "nearmiss":
      return {
        scores: { host: 3, guest: 1 },
        result: { winner: "host", word, ...TOOTH, attempts: [at("host", word, 2400), at("guest", "teeth", 2540)] },
      };
    case "split":
      return {
        scores: { host: 3, guest: 2 },
        result: { winner: "split", word, ...TOOTH, attempts: [at("host", word, 2400), at("guest", "truth", 2400)] },
      };
    case "splittimeout":
      return { scores: { host: 3, guest: 2 }, result: { winner: "split", reason: "timeout" } };
    case "nobody":
      return {
        scores: { host: 2, guest: 1 },
        result: { winner: "none", reason: "tied_nobody", attempts: [at("host", word, 2400), at("guest", "truth", 2400)] },
      };
    case "nobodytimeout":
      return { scores: { host: 2, guest: 1 }, result: { winner: "none", reason: "timeout" } };
    case "forfeit":
      return { scores: { host: 3, guest: 1 }, result: { winner: "host", reason: "forfeit" } };
    case "replay":
      return {
        scores: { host: 2, guest: 1 },
        result: { winner: "split", reason: "replay_pending", attempts: [at("host", word, 2400), at("guest", "truth", 2400)] },
      };
  }
}

export function parsePreview(
  phase: GamePhase,
  sp: { as?: string; guest?: string; stress?: string; away?: string; opp?: string; settling?: string; result?: string }
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
    result: (RESULT_VARIANTS as readonly string[]).includes(sp.result ?? "") ? (sp.result as ResultVariant) : "win",
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
          // Only the result reads it (for "2.40 s"); in the race it would
          // drain the clock.
          ...(opts.phase === "result" ? { raceStartedAt: RACE_START, ...resultFor(opts.result, opts.stress) } : {}),
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
