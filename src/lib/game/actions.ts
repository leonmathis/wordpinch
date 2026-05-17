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
   * Both players use this to lock their *own* letter for the round. The
   * server figures out which slot to write to based on the caller's clientId
   * (matched against rooms.host_id / rooms.guest_id) and transitions the
   * phase to 'reveal' once both letters are set.
   */
  lockMyLetter: (letter: string) => Promise<void>;
  /** Host-only: advance from reveal to race (also stamps raceStartedAt). */
  advanceToRace: () => Promise<void>;
  /**
   * Either player submits the winning word. First valid submission wins —
   * the server's optimistic-concurrency gate makes subsequent calls a 409.
   */
  submitWord: (
    word: string,
    extras?: {
      phonetic?: string;
      audio?: string;
      definitions?: { partOfSpeech: string; definition: string; example?: string }[];
    }
  ) => Promise<void>;
  /** Host-only: time's up with no valid submission. */
  timeoutRound: () => Promise<void>;
  /** Host-only. */
  nextRound: () => Promise<void>;
  /** Host-only. */
  rematch: () => Promise<void>;
  /**
   * Either player renames their own slot. No-op for spectators. Called from
   * the Lobby's name editor on blur (or debounced).
   */
  renameMe: (name: string) => Promise<void>;
};

/**
 * Server-side helpers that POST to the room's mutation endpoints. The set of
 * endpoints depends on the caller's role:
 *
 * - **Host actions** (startMatch, setSettings, advanceToRace, timeoutRound,
 *   nextRound, rematch) → POST /api/rooms/[code]/state with `hostId`. Only
 *   the host owns the round's state machine — they referee transitions.
 *
 * - **Both-players actions** (lockMyLetter, submitWord) → POST to dedicated
 *   endpoints (/lock-letter, /submit) that resolve the caller's role from
 *   the clientId vs the DB columns. Neither side can lock or submit on
 *   behalf of the other.
 */
export function useRoomActions(opts: {
  code: string | null;
  clientId: string;
  state: PersistedGameState | null;
  role: "host" | "guest" | "spectator" | null;
}): RoomActions {
  const { state, role } = opts;
  const postState = usePostState(opts);
  const code = opts.code;
  const clientId = opts.clientId;

  return React.useMemo<RoomActions>(() => {
    const isHost = role === "host";
    const canMutate = !!state && !!code && !!clientId && role !== null;
    // canPlay covers either active player slot; spectators can't mutate.
    const canPlay = canMutate && (role === "host" || role === "guest");

    const lockMyLetter = async (letter: string) => {
      if (!canPlay) return;
      const res = await fetch(`/api/rooms/${code}/lock-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, letter }),
      });
      if (!res.ok) {
        console.warn("[useRoomActions] lockMyLetter failed", await res.text());
      }
    };

    const renameMe = async (name: string) => {
      if (!canPlay) return;
      const trimmed = name.trim().slice(0, 32);
      if (!trimmed) return;
      const res = await fetch(`/api/rooms/${code}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: trimmed }),
      });
      if (!res.ok) {
        console.warn("[useRoomActions] renameMe failed", await res.text());
      }
    };

    const submitWord: RoomActions["submitWord"] = async (word, extras) => {
      if (!canPlay) return;
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          word,
          phonetic: extras?.phonetic,
          audio: extras?.audio,
          definitions: extras?.definitions,
        }),
      });
      if (!res.ok && res.status !== 409) {
        // 409 is the "someone else already submitted" case — expected and
        // benign; their state will arrive via broadcast.
        console.warn("[useRoomActions] submitWord failed", await res.text());
      }
    };

    return {
      ready: canMutate,

      startMatch: async () => {
        if (!isHost || !state) return;
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
        if (!isHost || !state) return;
        await postState({
          ...state,
          settings: { ...state.settings, ...partial },
        });
      },

      lockMyLetter,

      advanceToRace: async () => {
        if (!isHost || !state) return;
        if (state.phase !== "reveal") return;
        // Stamp the start time so refreshed / rejoined clients can compute
        // the correct remaining time rather than starting fresh at full.
        await postState({
          ...state,
          phase: "race",
          raceStartedAt: Date.now(),
        });
      },

      submitWord,

      timeoutRound: async () => {
        if (!isHost || !state) return;
        if (state.phase !== "race") return; // guard against double-fire
        await postState({
          ...state,
          phase: "result",
          result: { winner: "none", submittedAt: Date.now() },
        });
      },

      nextRound: async () => {
        if (!isHost || !state) return;
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
        if (!isHost || !state) return;
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

      renameMe,
    };
  }, [state, role, postState, code, clientId]);
}
