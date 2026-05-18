import type { PersistedGameState } from "./state";

/**
 * Strip server-private fields from a `PersistedGameState` before exposing it
 * to clients (broadcast, GET response, server-rendered initial state).
 *
 * During the `pick` phase, each player's locked letter is server-private —
 * the simultaneous-pick design relies on neither player seeing the other's
 * letter until both have locked. The lock RPC commits both letters and flips
 * the phase to `reveal` in the same UPDATE, so once a client sees a non-pick
 * phase the letters are safe to expose.
 *
 * Clients still know their own letter because they typed it (it lives in the
 * pick scene's local React state, not the broadcast).
 */
export function sanitizeStateForClient(
  state: PersistedGameState
): PersistedGameState {
  if (state.phase !== "pick") return state;
  if (!state.pick.hostLetter && !state.pick.guestLetter) return state;
  return {
    ...state,
    pick: { firstPicker: state.pick.firstPicker },
  };
}
