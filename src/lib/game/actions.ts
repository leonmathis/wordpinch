"use client";

import * as React from "react";
import type { PersistedGameState } from "./state";

type PostStateOpts = {
  code: string | null;
  clientId: string;
};

function usePostState({ code, clientId }: PostStateOpts) {
  return React.useCallback(
    async (next: PersistedGameState) => {
      if (!code || !clientId) return;
      const res = await fetch(`/api/rooms/${code}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: clientId, state: next }),
      });
      if (!res.ok) {
        console.warn("[useRoomActions] postState failed", await res.text());
      }
    },
    [code, clientId]
  );
}

export type RoomActions = {
  ready: boolean;
  startMatch: () => Promise<void>;
  /**
   * Host-only mutation that updates room settings. Used by the Lobby controls.
   * Pass any subset of settings — unset keys are kept as-is.
   */
  setSettings: (partial: Partial<PersistedGameState["settings"]>) => Promise<void>;
  /**
   * Locks the caller's letter for this round and advances the phase. Phase 6
   * is host-only — we randomize the opponent letter here so a single client
   * can drive the round flow end-to-end. Phase 7 splits this into separate
   * host / guest mutations.
   */
  lockMyLetter: (letter: string) => Promise<void>;
  advanceToRace: () => Promise<void>;
  /**
   * Record the outcome of a round. `by` is the winner:
   *   - "host" / "guest": that player scores +1 (or +length-bonus once that
   *     rule lands in Phase 7)
   *   - "split": both score +1 (tie behavior = split)
   *   - "none": nobody scores (tie behavior = nobody / timeout)
   */
  submitWord: (
    word: string,
    by: "host" | "guest" | "split" | "none",
    extras?: {
      phonetic?: string;
      audio?: string;
      definitions?: { partOfSpeech: string; definition: string; example?: string }[];
    }
  ) => Promise<void>;
  /** Time's up with no valid submission. Round ends with winner = 'none'. */
  timeoutRound: () => Promise<void>;
  nextRound: () => Promise<void>;
  rematch: () => Promise<void>;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomLetter(): string {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return LETTERS[bytes[0] % LETTERS.length];
}

/**
 * Host-side helpers that POST new state to /api/rooms/[code]/state. All
 * mutations re-broadcast to both clients via the room channel. Phase 6 keeps
 * authorization host-only; Phase 7 introduces a guest_id column and
 * dual-auth so the guest can also call mutating actions.
 */
export function useRoomActions(opts: {
  code: string | null;
  clientId: string;
  state: PersistedGameState | null;
}): RoomActions {
  const { state } = opts;
  const postState = usePostState(opts);

  return React.useMemo<RoomActions>(
    () => ({
      ready: !!state && !!opts.code && !!opts.clientId,

      startMatch: async () => {
        if (!state) return;
        await postState({
          ...state,
          phase: "pick",
          round: 1,
          pick: { firstPicker: state.pick.firstPicker ?? "host" },
          usedWords: [],
          scores: { host: 0, guest: 0 },
          result: undefined,
        });
      },

      setSettings: async (partial) => {
        if (!state) return;
        await postState({
          ...state,
          settings: { ...state.settings, ...partial },
        });
      },

      lockMyLetter: async (letter) => {
        if (!state || !letter) return;
        // Phase 6: caller is the host. Their letter is hostLetter; we
        // randomize guestLetter so a single user can drive the round. Which
        // of host/guest ends up as the WORD'S start vs end is purely a
        // display-time mapping driven by state.pick.firstPicker.
        const pick = {
          firstPicker: state.pick.firstPicker,
          hostLetter: letter[0].toUpperCase(),
          guestLetter: randomLetter(),
        };
        await postState({ ...state, pick, phase: "reveal" });
      },

      advanceToRace: async () => {
        if (!state) return;
        if (state.phase !== "reveal") return;
        // Stamp the start time so refreshed / rejoined clients can compute
        // the correct remaining time rather than starting fresh at full.
        await postState({
          ...state,
          phase: "race",
          raceStartedAt: Date.now(),
        });
      },

      submitWord: async (word, by, extras) => {
        if (!state) return;
        const trimmed = word.trim().toLowerCase();
        if (!trimmed) return;

        // Scoring respects tieBehavior for split/none outcomes.
        let scores = state.scores;
        if (by === "host") {
          scores = { ...state.scores, host: state.scores.host + 1 };
        } else if (by === "guest") {
          scores = { ...state.scores, guest: state.scores.guest + 1 };
        } else if (by === "split") {
          scores = {
            host: state.scores.host + 1,
            guest: state.scores.guest + 1,
          };
        }
        // "none" — no scores change.

        // For usedWords, the `by` column needs a value the type accepts.
        const usedBy = by === "none" ? "split" : by;

        await postState({
          ...state,
          phase: "result",
          result: {
            winner: by,
            word: trimmed,
            phonetic: extras?.phonetic,
            audio: extras?.audio,
            definitions: extras?.definitions,
            submittedAt: Date.now(),
          },
          usedWords: [
            ...state.usedWords,
            {
              round: state.round,
              word: trimmed,
              ipa: extras?.phonetic ?? "",
              by: usedBy,
            },
          ],
          scores,
        });
      },

      timeoutRound: async () => {
        if (!state) return;
        if (state.phase !== "race") return; // guard against double-fire
        await postState({
          ...state,
          phase: "result",
          result: { winner: "none", submittedAt: Date.now() },
        });
      },

      nextRound: async () => {
        if (!state) return;
        // Match over — go to matchend.
        const rounds = state.settings.rounds;
        if (state.round >= rounds) {
          await postState({ ...state, phase: "matchend" });
          return;
        }
        const nextFirstPicker: "host" | "guest" =
          state.pick.firstPicker === "host" ? "guest" : "host";
        await postState({
          ...state,
          phase: "pick",
          round: state.round + 1,
          pick: { firstPicker: nextFirstPicker },
          result: undefined,
        });
      },

      rematch: async () => {
        if (!state) return;
        const nextFirstPicker: "host" | "guest" =
          state.pick.firstPicker === "host" ? "guest" : "host";
        await postState({
          ...state,
          phase: "lobby",
          round: 0,
          scores: { host: 0, guest: 0 },
          pick: { firstPicker: nextFirstPicker },
          usedWords: [],
          result: undefined,
        });
      },
    }),
    [state, postState, opts.code, opts.clientId]
  );
}
