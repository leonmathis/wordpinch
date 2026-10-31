/**
 * Features from the redesign that ship behind a flag until their server
 * side exists (docs/redesign/03-code-mapping.md §5). A flag only hides UI;
 * it never makes a half-built feature reachable.
 */
export const FEATURES = {
  /** F6: same letters for everyone each day, streak, leaderboard. */
  dailyPinch: false,
  /** F7: matchmaking queue with fixed 5 × 30 s rules. */
  quickMatch: false,
  /** F8: local two-player mode on one device. */
  passThePhone: false,
} as const;
