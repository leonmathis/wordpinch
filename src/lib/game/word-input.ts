const NON_ALPHA_REGEX = /[^A-Z]/g;

/**
 * The word field with its first letter locked (race, daily pinch): takes
 * what the input now holds and returns the value to show, plus where the
 * caret should go when letters had to move.
 *
 * Letters typed in front of the locked letter (caret moved to the start)
 * go right after it, and the caret follows them; before, typing "OOTH"
 * after autofocus came out as "TOOTHT". Only an insertion moves letters:
 * a deleted lock letter simply comes back.
 */
export function lockedWordInput(raw: string, prev: string, lock: string): { value: string; caret: number | null } {
  const cleaned = raw.toUpperCase().replace(NON_ALPHA_REGEX, "");
  if (cleaned.startsWith(lock)) return { value: cleaned, caret: null };
  const at = cleaned.length > prev.length ? cleaned.indexOf(lock) : -1;
  if (at > 0) return { value: lock + cleaned.slice(0, at) + cleaned.slice(at + 1), caret: at + 1 };
  return { value: lock + cleaned, caret: null };
}
