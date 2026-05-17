import { z } from "zod";
import type { PersistedGameState } from "./state";

/**
 * Runtime schema for `PersistedGameState`. Used by POST /api/rooms/[code]/state
 * to reject malformed payloads before they overwrite `rooms.state`, which
 * could otherwise wedge a room into a state the client code doesn't know
 * how to handle. Field limits intentionally mirror the constraints applied
 * elsewhere (settings ranges in the lobby inputs, word length in /submit,
 * etc.) so a well-behaved client never sees a 400 from this endpoint.
 *
 * Kept in a sibling file (not state.ts) so consumers that only need the
 * type don't pull zod into their bundle — `state.ts` has only `import type`
 * importers today.
 */

const LETTER = z.string().regex(/^[A-Z]$/);
const WORD = z.string().min(1).max(50);
const PHONETIC = z.string().max(200);
const NAME = z.string().min(1).max(32);

const definitionSchema = z.object({
  partOfSpeech: z.string().max(64),
  definition: z.string().max(1000),
  example: z.string().max(1000).optional(),
});

const attemptSchema = z.object({
  by: z.enum(["host", "guest"]),
  word: WORD,
  phonetic: PHONETIC.optional(),
  audio: z.string().max(500).optional(),
  definitions: z.array(definitionSchema).max(20).optional(),
  submittedAt: z.number().int().nonnegative(),
});

export const persistedGameStateSchema = z.object({
  phase: z.enum([
    "landing",
    "lobby",
    "pick",
    "reveal",
    "race",
    "result",
    "matchend",
    "spectator",
  ]),
  round: z.number().int().min(0).max(1000),
  total: z.number().int().min(0).max(1000).optional(),
  scores: z.object({
    host: z.number().int().min(0).max(10_000),
    guest: z.number().int().min(0).max(10_000),
  }),
  settings: z.object({
    rounds: z.number().int().min(1).max(50),
    roundTimerSec: z.number().int().min(5).max(600),
    minWordLength: z.number().int().min(2).max(20),
    tieBehavior: z.enum(["replay", "split", "nobody"]),
    allowProperNouns: z.boolean(),
    audioDefinitions: z.boolean(),
    language: z.literal("en"),
  }),
  players: z.object({
    host: z.object({ name: NAME }).nullable(),
    guest: z.object({ name: NAME }).nullable(),
  }),
  pick: z.object({
    hostLetter: LETTER.optional(),
    guestLetter: LETTER.optional(),
    firstPicker: z.enum(["host", "guest"]),
  }),
  result: z
    .object({
      winner: z.enum(["host", "guest", "split", "none"]),
      reason: z
        .enum(["timeout", "tied_nobody", "forfeit", "replay_pending"])
        .optional(),
      word: WORD.optional(),
      phonetic: PHONETIC.optional(),
      audio: z.string().max(500).optional(),
      definitions: z.array(definitionSchema).max(20).optional(),
      submittedAt: z.number().int().nonnegative().optional(),
      attempts: z
        .array(
          z.object({
            by: z.enum(["host", "guest"]),
            word: WORD,
            ipa: PHONETIC.optional(),
            submittedAt: z.number().int().nonnegative(),
          })
        )
        .max(2)
        .optional(),
    })
    .optional(),
  raceStartedAt: z.number().int().nonnegative().optional(),
  usedWords: z
    .array(
      z.object({
        round: z.number().int().min(0).max(1000),
        word: WORD,
        ipa: PHONETIC,
        by: z.enum(["host", "guest", "split"]),
        timeMs: z.number().int().nonnegative().optional(),
      })
    )
    .max(1000),
  createdAt: z.number().int().nonnegative(),
  pendingResult: z
    .object({
      attempts: z.array(attemptSchema).min(1).max(10),
    })
    .optional(),
}) satisfies z.ZodType<PersistedGameState>;
