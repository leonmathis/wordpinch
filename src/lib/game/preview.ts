import { initialGameState, type PersistedGameState } from "./state";
import { REACTIONS, type ReactionId } from "./reactions";
import type { GamePhase } from "./types";

/**
 * Dev-only design preview (`/r/K7QM?phase=…&as=host|guest`). Seeds a room
 * state and a seat without touching the network, so every view of a phase
 * can be rendered and tested. `stress` swaps in the longest names the
 * server accepts (32 characters).
 */
export type PreviewOpts = {
  phase: GamePhase;
  as: "host" | "guest" | "spectator";
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
  /** Match outcome for the host (`?end=win|loss|tie`), for phase=matchend. */
  end: "win" | "loss" | "tie";
  /** Match length for phase=matchend (`?rounds=15`). */
  rounds: 7 | 15;
  /** Match-end collection banner count (`?collected=3`), 0 hides it. */
  collected: number;
  /** An incoming reaction or cheer (`?rx=close`, `?rx=go-host`). */
  rx: ReactionId | null;
  /** The opponent's letter count in the race (`?typed=4`). */
  typed: number | null;
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

type Used = PersistedGameState["usedWords"][number];
type Outcome = NonNullable<PersistedGameState["rounds"]>[number];

/**
 * A finished match: one word per round where someone scored, a near miss
 * in round 3, a both-scored tie in 4 and outcome-only rounds. Host leads
 * 4–3 (`win`); `loss` and `tie` adjust the last round and the totals.
 */
function finishedMatch(end: PreviewOpts["end"], rounds: 7 | 15, stress: boolean) {
  const u = (round: number, word: string, by: Used["by"], s: number): Used => ({ round, word, ipa: "", by, timeMs: s * 1000 });
  const used: Used[] = [
    u(1, "glove", "host", 3.1),
    u(2, "plank", "guest", 4.0),
    u(3, "tooth", "host", 2.4),
    u(3, "teeth", "guest", 2.5),
    u(4, "brisk", "host", 5.2),
    u(4, "brick", "guest", 5.2),
    u(5, stress ? "uncharacteristically" : "queen", "host", 6.8),
    u(7, "shrimp", "guest", 3.9),
  ];
  const outcomes: Outcome[] = [
    { round: 1, winner: "host" },
    { round: 2, winner: "guest" },
    { round: 3, winner: "host" },
    { round: 4, winner: "split" },
    { round: 5, winner: "host" },
    { round: 6, winner: "none", reason: "timeout" },
    { round: 7, winner: "guest" },
  ];
  if (rounds === 15) {
    used.push(u(8, "chair", "host", 4.4), u(10, "mouth", "guest", 2.9), u(11, "plush", "host", 5.0), u(13, "graph", "guest", 3.3), u(14, "swish", "host", 4.1));
    outcomes.push(
      { round: 8, winner: "host" },
      { round: 9, winner: "none", reason: "tied_nobody" },
      { round: 10, winner: "guest" },
      { round: 11, winner: "host" },
      { round: 12, winner: "split", reason: "timeout" },
      { round: 13, winner: "guest" },
      { round: 14, winner: "host" },
      { round: 15, winner: "guest", reason: "forfeit" },
    );
  }
  const base = rounds === 15 ? { host: 8, guest: 7 } : { host: 4, guest: 3 };
  const scores =
    end === "win" ? base : end === "loss" ? { host: base.guest, guest: base.host } : { host: base.host - 0.5, guest: base.host - 0.5 };
  return { used, outcomes, scores };
}

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
  sp: {
    as?: string;
    guest?: string;
    stress?: string;
    away?: string;
    opp?: string;
    settling?: string;
    result?: string;
    end?: string;
    rounds?: string;
    collected?: string;
    rx?: string;
    typed?: string;
  }
): PreviewOpts | null {
  if (sp.as !== "host" && sp.as !== "guest" && sp.as !== "spectator") return null;
  return {
    phase,
    as: sp.as,
    // A guest or spectator viewer implies a taken guest seat.
    guest: sp.as !== "host" || sp.guest !== "0",
    stress: sp.stress === "1",
    away: sp.away === "1",
    oppSubmitted: sp.opp === "submitted",
    settling: sp.settling === "1",
    result: (RESULT_VARIANTS as readonly string[]).includes(sp.result ?? "") ? (sp.result as ResultVariant) : "win",
    end: sp.end === "loss" || sp.end === "tie" ? sp.end : "win",
    rounds: sp.rounds === "15" ? 15 : 7,
    collected: Math.max(0, Math.min(99, Number.parseInt(sp.collected ?? "0", 10) || 0)),
    rx: sp.rx && Object.hasOwn(REACTIONS, sp.rx) ? (sp.rx as ReactionId) : null,
    typed: sp.typed && /^\d{1,2}$/.test(sp.typed) ? Number(sp.typed) : null,
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
                      // Settling: your own word. Otherwise the other seat's
                      // (for a spectator, the guest's).
                      by: opts.settling && opts.as !== "spectator" ? opts.as : opts.as === "host" || opts.as === "spectator" ? ("guest" as const) : ("host" as const),
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
    ...(opts.phase === "matchend"
      ? (() => {
          const m = finishedMatch(opts.end, opts.rounds, opts.stress);
          return {
            round: opts.rounds,
            settings: { ...base.settings, rounds: opts.rounds, roundTimerSec: 30, minWordLength: 4 },
            scores: m.scores,
            usedWords: m.used,
            rounds: m.outcomes,
          };
        })()
      : {}),
  };
}
