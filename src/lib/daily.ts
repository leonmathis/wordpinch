import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { fairPairs } from "./words/pairs";
import { validateWord, type Definition } from "./words/validate";
import { collectWord } from "./collection";

/**
 * F6 daily pinch. One puzzle per UTC day, the same for everyone; one try
 * per player, timed by the server from the moment it hands out the letters
 * (decision 1: the clock starts with the letters, so reading them first
 * can't help). Tables: daily_puzzles, daily_attempts (server-only).
 */

const DAY_MS = 86_400_000;
/** #1 was 26.6.2026, so 31.10.2026 is #128 (as in the artboard). */
const EPOCH = Date.UTC(2026, 5, 26);
const MIN_LENGTH = 4;
/** A pair needs at least this many valid words to be fair. */
const MIN_ANSWERS = 12;

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function dayNumber(day: string): number {
  return Math.floor((Date.parse(`${day}T00:00:00Z`) - EPOCH) / DAY_MS) + 1;
}

export function nextDayAt(now = Date.now()): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

function previousDay(day: string): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
}

/** Small deterministic RNG (mulberry32) seeded from the day. */
function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Puzzle = { day: string; number: number; start: string; end: string; minLength: number };

/** The letters for `day`, picked from the date: same day, same pair. */
async function pickLetters(day: string): Promise<{ start: string; end: string }> {
  const fair = await fairPairs(MIN_LENGTH, MIN_ANSWERS);
  const pick = fair[Math.floor(rng(day)() * fair.length)];
  return { start: pick[0], end: pick[1] };
}

export async function getPuzzle(day = utcDay()): Promise<Puzzle> {
  const admin = supabaseAdmin();
  const read = async () => {
    const { data, error } = await admin.from("daily_puzzles").select("*").eq("day", day).maybeSingle();
    if (error) throw error;
    return data;
  };
  let row = await read();
  if (!row) {
    const { start, end } = await pickLetters(day);
    // Two first visitors may race: the loser's insert is ignored and both
    // read the same row (the pick is deterministic anyway).
    const { error } = await admin
      .from("daily_puzzles")
      .upsert(
        { day, number: dayNumber(day), start_letter: start, end_letter: end, min_length: MIN_LENGTH },
        { onConflict: "day", ignoreDuplicates: true }
      );
    if (error) throw error;
    row = await read();
  }
  return { day, number: row.number, start: row.start_letter, end: row.end_letter, minLength: row.min_length };
}

type AttemptRow = {
  day: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  word: string | null;
  time_ms: number | null;
};

async function attemptOf(userId: string, day: string): Promise<AttemptRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("daily_attempts")
    .select("day, name, started_at, finished_at, word, time_ms")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Days in a row with a finished pinch, ending today (or yesterday while today is open). */
async function streakOf(userId: string, today: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("daily_attempts")
    .select("day")
    .eq("user_id", userId)
    .not("time_ms", "is", null)
    .order("day", { ascending: false })
    .limit(400);
  if (error) throw error;
  const done = new Set((data ?? []).map((r) => r.day as string));
  let day = done.has(today) ? today : previousDay(today);
  let n = 0;
  while (done.has(day)) {
    n += 1;
    day = previousDay(day);
  }
  return n;
}

export type DailyStatus = {
  number: number;
  day: string;
  nextAt: number;
  streak: number;
  /** new: not started; playing: letters out, clock running; done: finished. */
  state: "new" | "playing" | "done";
  letters?: { start: string; end: string; minLength: number };
  startedAt?: number;
  result?: {
    word: string;
    timeMs: number;
    definitions: Definition[];
    players: number;
    /** Share of today's other players this time beat, 0–100. */
    fasterThan: number;
    board: { rank: number; name: string; word: string; timeMs: number }[];
  };
};

export async function dailyStatus(userId: string | null, now = Date.now()): Promise<DailyStatus> {
  const puzzle = await getPuzzle(utcDay(now));
  const base = {
    number: puzzle.number,
    day: puzzle.day,
    nextAt: nextDayAt(now),
    streak: userId ? await streakOf(userId, puzzle.day) : 0,
  };
  const attempt = userId ? await attemptOf(userId, puzzle.day) : null;
  if (!attempt) return { ...base, state: "new" };
  const letters = { start: puzzle.start, end: puzzle.end, minLength: puzzle.minLength };
  const startedAt = Date.parse(attempt.started_at);
  if (attempt.time_ms === null || !attempt.word) return { ...base, state: "playing", letters, startedAt };
  return { ...base, state: "done", letters, startedAt, result: await resultFor(puzzle.day, attempt) };
}

async function resultFor(day: string, attempt: AttemptRow): Promise<NonNullable<DailyStatus["result"]>> {
  const admin = supabaseAdmin();
  const [board, total, slower, defs] = await Promise.all([
    admin
      .from("daily_attempts")
      .select("name, word, time_ms")
      .eq("day", day)
      .not("time_ms", "is", null)
      .order("time_ms", { ascending: true })
      .order("finished_at", { ascending: true })
      .limit(3),
    admin.from("daily_attempts").select("user_id", { count: "exact", head: true }).eq("day", day).not("time_ms", "is", null),
    admin.from("daily_attempts").select("user_id", { count: "exact", head: true }).eq("day", day).gt("time_ms", attempt.time_ms!),
    validateWord(attempt.word!, { allowProperNouns: false }).catch(() => null),
  ]);
  for (const r of [board, total, slower]) if (r.error) throw r.error;
  const players = total.count ?? 1;
  return {
    word: attempt.word!,
    timeMs: attempt.time_ms!,
    definitions: defs?.definitions ?? [],
    players,
    fasterThan: players > 1 ? Math.round(((slower.count ?? 0) / (players - 1)) * 100) : 100,
    board: (board.data ?? []).map((r, i) => ({ rank: i + 1, name: r.name, word: r.word, timeMs: r.time_ms })),
  };
}

/**
 * Hands out today's letters and starts this player's clock. Asking again
 * (a reload) returns the same start time: the clock doesn't reset.
 */
export async function startDaily(userId: string, name: string, now = Date.now()): Promise<DailyStatus> {
  const puzzle = await getPuzzle(utcDay(now));
  const { error } = await supabaseAdmin()
    .from("daily_attempts")
    .upsert(
      { user_id: userId, day: puzzle.day, name: name.trim().slice(0, 32) || "Someone", started_at: new Date(now).toISOString() },
      { onConflict: "user_id,day", ignoreDuplicates: true }
    );
  if (error) throw error;
  return dailyStatus(userId, now);
}

export type SubmitDaily =
  | { ok: true; status: DailyStatus }
  | { ok: false; reason: "not_started" | "done" | "too_short" | "wrong_start" | "wrong_end" | "not_a_word" };

/** Checks a word against today's letters and, if it counts, stops the clock. */
export async function submitDaily(userId: string, rawWord: string, now = Date.now()): Promise<SubmitDaily> {
  const puzzle = await getPuzzle(utcDay(now));
  const attempt = await attemptOf(userId, puzzle.day);
  if (!attempt) return { ok: false, reason: "not_started" };
  if (attempt.time_ms !== null) return { ok: false, reason: "done" };
  const word = rawWord.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word) || word.length < puzzle.minLength) return { ok: false, reason: "too_short" };
  if (word[0] !== puzzle.start.toLowerCase()) return { ok: false, reason: "wrong_start" };
  if (word[word.length - 1] !== puzzle.end.toLowerCase()) return { ok: false, reason: "wrong_end" };
  const check = await validateWord(word, { allowProperNouns: false });
  if (!check.valid) return { ok: false, reason: "not_a_word" };

  const timeMs = Math.max(0, now - Date.parse(attempt.started_at));
  const { data, error } = await supabaseAdmin()
    .from("daily_attempts")
    .update({ finished_at: new Date(now).toISOString(), word, time_ms: timeMs })
    .eq("user_id", userId)
    .eq("day", puzzle.day)
    .is("time_ms", null)
    .select("day")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "done" };
  try {
    await collectWord({ userId, word, definitions: check.definitions, source: "won", timeMs, dailyNumber: puzzle.number });
  } catch (err) {
    console.error("[daily] collect", err);
  }
  return { ok: true, status: await dailyStatus(userId, now) };
}
