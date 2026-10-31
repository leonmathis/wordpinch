import type { UsedWord } from "./types";

export type Award = { word: string; by: string; detail: string };

/**
 * Match-end awards worked out from the words already in state; no backend.
 * Fastest = lowest `timeMs`, longest = most letters; ties go to the earlier
 * round. Null when no word qualifies (a match of timeouts).
 */
export function matchAwards(used: UsedWord[]): { fastest: Award | null; longest: Award | null } {
  const timed = used.filter((u) => u.timeMs !== undefined);
  const fastest = timed.reduce<UsedWord | null>(
    (best, u) => (!best || u.timeMs! < best.timeMs! || (u.timeMs === best.timeMs && u.round < best.round) ? u : best),
    null
  );
  const longest = used.reduce<UsedWord | null>(
    (best, u) => (!best || u.word.length > best.word.length || (u.word.length === best.word.length && u.round < best.round) ? u : best),
    null
  );
  return {
    fastest: fastest ? { word: fastest.word, by: fastest.by, detail: `${(fastest.timeMs! / 1000).toFixed(1)} s` } : null,
    longest: longest ? { word: longest.word, by: longest.by, detail: `${longest.word.length} letters` } : null,
  };
}
