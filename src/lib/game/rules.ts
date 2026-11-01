import type { PersistedGameState } from "./state";

/**
 * F4 no-repeat: the letters picked in earlier rounds of this match, which
 * can't be picked again. Empty when the rule is off. A replayed round keeps
 * its number, so its own letters are free again. Once all 26 are used (a
 * 14-round match can get there) the rule lets go rather than stall the
 * match.
 */
export function blockedLetters(state: Pick<PersistedGameState, "settings" | "round" | "usedLetters">): Set<string> {
  if (!state.settings.noRepeat) return new Set();
  const used = new Set<string>();
  for (const entry of state.usedLetters ?? []) {
    if (entry.round < state.round) for (const l of entry.letters) used.add(l);
  }
  return used.size >= 26 ? new Set() : used;
}

/** Records a round's two letters, replacing an earlier take of the same round. */
export function withRoundLetters(
  usedLetters: PersistedGameState["usedLetters"],
  round: number,
  letters: string[]
): NonNullable<PersistedGameState["usedLetters"]> {
  return [...(usedLetters ?? []).filter((e) => e.round !== round), { round, letters: [...new Set(letters)] }];
}
