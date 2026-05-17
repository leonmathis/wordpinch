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
   * Locks the caller's letter for this round and advances the phase. Phase 6
   * is host-only — we randomize the opponent letter here so a single client
   * can drive the round flow end-to-end. Phase 7 splits this into separate
   * host / guest mutations.
   */
  lockMyLetter: (letter: string) => Promise<void>;
  advanceToRace: () => Promise<void>;
  submitWord: (
    word: string,
    by: "host" | "guest",
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

      lockMyLetter: async (letter) => {
        if (!state || !letter) return;
        const myLetter = letter[0].toUpperCase();
        const opp = randomLetter();
        // Whoever picks first sets the start letter; the other sets the end.
        const hostFirst = state.pick.firstPicker === "host";
        const pick = {
          firstPicker: state.pick.firstPicker,
          hostLetter: hostFirst ? myLetter : opp,
          guestLetter: hostFirst ? opp : myLetter,
        };
        await postState({ ...state, pick, phase: "reveal" });
      },

      advanceToRace: async () => {
        if (!state) return;
        if (state.phase !== "reveal") return;
        await postState({ ...state, phase: "race" });
      },

      submitWord: async (word, by, extras) => {
        if (!state) return;
        const trimmed = word.trim().toLowerCase();
        if (!trimmed) return;
        const scores =
          by === "host"
            ? { ...state.scores, host: state.scores.host + 1 }
            : by === "guest"
            ? { ...state.scores, guest: state.scores.guest + 1 }
            : state.scores;
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
            { round: state.round, word: trimmed, ipa: extras?.phonetic ?? "", by },
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
        if (state.round >= state.total) {
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
