import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { supabaseServer } from "./supabase/server";
import { isUuid } from "./supabase/identity";
import type { PersistedGameState } from "./game/state";

/**
 * F2 word collection. Writes go through `collect_word` with the admin
 * client; reads run with the caller's session, so RLS limits them to the
 * caller's own rows.
 */

export type Definition = { partOfSpeech: string; definition: string; example?: string };

export type CollectedWord = {
  word: string;
  definitions: Definition[];
  source: "won" | "saved";
  opponent: string | null;
  time_ms: number | null;
  created_at: string;
};

const WORD_REGEX = /^[a-z]{1,50}$/;

/**
 * Adds one word to a player's collection. Returns whether it was new, or
 * null when the seat is a legacy clientId with no account (the foreign key
 * refuses it; those players have nowhere to keep words).
 */
export async function collectWord(opts: {
  userId: string;
  word: string;
  definitions?: Definition[];
  source: "won" | "saved";
  opponent?: string | null;
  timeMs?: number;
  roomCode?: string;
}): Promise<boolean | null> {
  const word = opts.word.toLowerCase();
  if (!isUuid(opts.userId) || !WORD_REGEX.test(word)) return null;
  const { data, error } = await supabaseAdmin().rpc("collect_word", {
    p_user_id: opts.userId,
    p_word: word,
    p_definitions: opts.definitions ?? [],
    p_source: opts.source,
    p_opponent: opts.opponent ?? null,
    p_time_ms: opts.timeMs ?? null,
    p_room_code: opts.roomCode ?? null,
  });
  // 23503: the seat is not an account (pre-F1 clientId fallback).
  if (error?.code === "23503") return null;
  if (error) throw error;
  return data === true;
}

/**
 * Records the words a resolved round awarded: the winner's word, or both
 * words of a split tie. Called once per resolution, right after the
 * resolver's write succeeded; failures are logged and never block the game.
 */
export async function collectRoundWins(opts: {
  code: string;
  seats: { host: string; guest: string | null };
  state: PersistedGameState;
  attempts: NonNullable<PersistedGameState["pendingResult"]>["attempts"];
}): Promise<void> {
  const { state, seats } = opts;
  const winner = state.result?.winner;
  if (!winner || winner === "none" || state.result?.reason) return;
  const sides = winner === "split" ? (["host", "guest"] as const) : [winner];
  const startedAt = state.raceStartedAt;
  await Promise.all(
    sides.map(async (side) => {
      const userId = side === "host" ? seats.host : seats.guest;
      const attempt = opts.attempts.find((a) => a.by === side);
      if (!userId || !attempt) return;
      const other = side === "host" ? state.players.guest : state.players.host;
      try {
        await collectWord({
          userId,
          word: attempt.word,
          definitions: attempt.definitions,
          source: "won",
          opponent: other?.name ?? null,
          timeMs: startedAt ? Math.max(0, attempt.submittedAt - startedAt) : undefined,
          roomCode: opts.code,
        });
      } catch (err) {
        console.error("[collection] collect won word", err);
      }
    })
  );
}

/** The caller's collection, newest first. Empty without a session. */
export async function listCollection(): Promise<CollectedWord[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("collected_words")
    .select("word, definitions, source, opponent, time_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as CollectedWord[];
}

/** How many words the caller added to their collection in this room since `since`. */
export async function countCollectedSince(code: string, since: number): Promise<number> {
  const supabase = await supabaseServer();
  const { count, error } = await supabase
    .from("collected_words")
    .select("word", { count: "exact", head: true })
    .eq("room_code", code)
    .gte("created_at", new Date(since).toISOString());
  if (error) throw error;
  return count ?? 0;
}
