import "server-only";
import { getWordlist } from "./wordlist";

/**
 * Letter pairs (first, last) with at least `minAnswers` words of `minLength`+
 * letters in the game word list: fair to hand out without a pick. Used by
 * the daily pinch (F6, one pair per date) and pass the phone (F8, a random
 * pair per round). Cached per process and length.
 */
const cache = new Map<string, Promise<string[]>>();

export function fairPairs(minLength: number, minAnswers = 12): Promise<string[]> {
  const key = `${minLength}:${minAnswers}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = getWordlist().then((words) => {
      const counts = new Map<string, number>();
      for (const w of words) {
        if (w.length < minLength) continue;
        const k = `${w[0]}${w[w.length - 1]}`.toUpperCase();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts.entries()].filter(([, n]) => n >= minAnswers).map(([k]) => k).sort();
    });
    cache.set(key, hit);
  }
  return hit;
}
