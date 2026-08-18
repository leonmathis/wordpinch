"use client";

import * as React from "react";
import { toast } from "sonner";
import type { PersistedGameState } from "./state";

type PostStateOpts = {
  code: string | null;
  clientId: string;
};

/**
 * Turns a failed mutation into something the player can actually see.
 *
 * Every action used to swallow failures into `console.warn`, so a 429 from
 * the rate limiter (or a dropped connection) made buttons look simply dead
 * — "Start game" clicked, nothing happened, no explanation anywhere.
 */
async function reportFailure(res: Response, action: string): Promise<void> {
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* body already consumed or unreadable */
  }
  console.warn(`[useRoomActions] ${action} failed`, res.status, detail);

  if (res.status === 429) {
    const retry = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
    const when = Number.isFinite(retry)
      ? retry < 90
        ? `${retry}s`
        : `${Math.ceil(retry / 60)} min`
      : "a moment";
    toast.error(`Too many requests — try again in ${when}.`);
    return;
  }
  if (res.status === 404) {
    toast.error("This room no longer exists.");
    return;
  }
  if (res.status === 403) {
    toast.error("You're not allowed to do that in this room.");
    return;
  }
  toast.error(`Couldn't ${action} — try again.`);
}

function reportNetworkError(action: string, err: unknown): void {
  console.warn(`[useRoomActions] ${action} network error`, err);
  toast.error(`Connection problem — couldn't ${action}.`);
}

function usePostState({ code, clientId }: PostStateOpts) {
  return React.useCallback(
    async (next: PersistedGameState, action = "save the room"): Promise<boolean> => {
      if (!code || !clientId) return false;
      try {
        const res = await fetch(`/api/rooms/${code}/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `actorId` (not `hostId`): either seated player may drive
          // transitions, because the guest takes over as referee when the
          // host's client disappears mid-match.
          body: JSON.stringify({ actorId: clientId, state: next }),
        });
        if (!res.ok) {
          await reportFailure(res, action);
          return false;
        }
        return true;
      } catch (err) {
        reportNetworkError(action, err);
        return false;
      }
    },
    [code, clientId]
  );
}

export type RoomActions = {
  ready: boolean;
  startMatch: () => Promise<void>;
  /**
   * Host-only settings update. Sends only the changed keys — the server
   * merges them into the live row, so two controls touched inside the same
   * broadcast round-trip can't overwrite one another.
   */
  setSettings: (partial: Partial<PersistedGameState["settings"]>) => Promise<void>;
  /**
   * Both players use this to lock their *own* letter for the round. The
   * server figures out which slot to write to based on the caller's clientId
   * (matched against rooms.host_id / rooms.guest_id) and transitions the
   * phase to 'reveal' once both letters are set.
   *
   * Resolves `true` only when the server accepted the lock, so the UI can
   * roll its optimistic "Locked" state back on failure.
   */
  lockMyLetter: (letter: string) => Promise<boolean>;
  /** Referee-only: advance from reveal to race (also stamps raceStartedAt). */
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
  /** Referee-only: time's up with no valid submission. */
  timeoutRound: () => Promise<void>;
  /**
   * Either player can end a pick phase that has stalled — the opponent is
   * still connected but hasn't locked a letter, and nothing else resolves
   * that state (the forfeit path only covers disconnects, and no timer runs
   * during pick). Applies the same "out of time" semantics as a race
   * timeout, so nobody can gain a point by using it.
   */
  skipStalledRound: () => Promise<void>;
  /** Referee-only. */
  nextRound: () => Promise<void>;
  /**
   * Referee-only. Restart the *same* round at pick phase — used to close a
   * `replay_pending` result (sim tie + tieBehavior=replay) once the
   * "Replaying…" countdown elapses. Round number is unchanged.
   */
  replayRound: () => Promise<void>;
  /** Referee-only. */
  rematch: () => Promise<void>;
  /**
   * Either player renames their own slot. No-op for spectators. Called from
   * the Lobby's name editor on blur (or debounced).
   */
  renameMe: (name: string) => Promise<void>;
  /**
   * Referee-only. Awards the round to `winningSide` and ends the round. Used
   * by the grace-period timer when the opponent has stayed disconnected —
   * they forfeit the round to the player who's still here. Valid from the
   * pick, reveal and race phases, all of which otherwise stall forever
   * while one side is gone.
   */
  forfeitRound: (winningSide: "host" | "guest") => Promise<void>;
};

/**
 * Server-side helpers that POST to the room's mutation endpoints. The set of
 * endpoints depends on the caller's role:
 *
 * - **Referee actions** (advanceToRace, timeoutRound, nextRound, replayRound,
 *   rematch, forfeitRound) → POST /api/rooms/[code]/state with `actorId`.
 *   The referee is normally the host; when the host's client goes away
 *   mid-match the remaining guest takes over (`canReferee`), because every
 *   phase transition used to hinge on the host's tab being open.
 *
 * - **Host-only actions** (startMatch, setSettings) → the host owns the
 *   lobby; there is nothing to rescue there because a match can't run
 *   without both players anyway.
 *
 * - **Both-players actions** (lockMyLetter, submitWord, renameMe) → dedicated
 *   endpoints that resolve the caller's role from the clientId vs the DB
 *   columns. Neither side can lock or submit on behalf of the other.
 */
export function useRoomActions(opts: {
  code: string | null;
  clientId: string;
  state: PersistedGameState | null;
  role: "host" | "guest" | "spectator" | null;
  /**
   * True when this client is allowed to drive phase transitions: the host
   * always, the guest only once the host is confirmed absent.
   */
  canReferee?: boolean;
  /**
   * Optional state-applicator that mutations can use to seed the live
   * state from their API response, bypassing the broadcast race. Wired
   * to `useRoomChannel`'s exposed setter in `WordpinchUI`.
   */
  applyState?: (state: PersistedGameState) => void;
}): RoomActions {
  const { state, role, applyState, canReferee = false } = opts;
  const postState = usePostState(opts);
  const code = opts.code;
  const clientId = opts.clientId;
  /**
   * Serializes settings patches. The endpoint merges server-side, but two
   * patches fired in the same tick still overlapped: both read the row
   * before either had written, and the second write dropped the first
   * change. Chaining them means each request reads the previous one's
   * result. (Only the host writes settings, so one queue is enough.)
   *
   * Lazily initialised — `useRef(Promise.resolve())` would allocate a fresh
   * promise on every render and throw it away.
   */
  const settingsQueue = React.useRef<Promise<void> | null>(null);

  return React.useMemo<RoomActions>(() => {
    const isHost = role === "host";
    const canMutate = !!state && !!code && !!clientId && role !== null;
    // canPlay covers either active player slot; spectators can't mutate.
    const canPlay = canMutate && (role === "host" || role === "guest");
    // Referees drive phase transitions. Spectators never qualify.
    const isReferee = canPlay && canReferee;

    const lockMyLetter = async (letter: string): Promise<boolean> => {
      if (!canPlay) return false;
      try {
        const res = await fetch(`/api/rooms/${code}/lock-letter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, letter }),
        });
        if (!res.ok) {
          await reportFailure(res, "lock your letter");
          return false;
        }
        return true;
      } catch (err) {
        reportNetworkError("lock your letter", err);
        return false;
      }
    };

    const renameMe = async (name: string) => {
      if (!canPlay) return;
      const trimmed = name.trim().slice(0, 32);
      if (!trimmed) return;
      try {
        const res = await fetch(`/api/rooms/${code}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, name: trimmed }),
        });
        if (!res.ok) await reportFailure(res, "save your name");
      } catch (err) {
        reportNetworkError("save your name", err);
      }
    };

    const submitWord: RoomActions["submitWord"] = async (word, extras) => {
      if (!canPlay) return;
      try {
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
        if (res.ok) {
          // Seed liveState from the response so the result phase mounts
          // with the *final* state (incl. near-miss attempts) rather than
          // briefly rendering the solo-winner snapshot before the
          // broadcast catches up.
          try {
            const data = (await res.json()) as {
              ok?: boolean;
              state?: PersistedGameState;
            };
            if (data.state && applyState) applyState(data.state);
          } catch {
            /* ignore malformed body */
          }
        } else if (res.status !== 409) {
          // 409 is the "someone else already submitted" case — expected and
          // benign; their state will arrive via broadcast.
          await reportFailure(res, "submit your word");
        }
      } catch (err) {
        reportNetworkError("submit your word", err);
      }
    };

    return {
      ready: canMutate,

      startMatch: async () => {
        if (!isHost || !state) return;
        await postState(
          {
            ...state,
            phase: "pick",
            round: 1,
            pick: { firstPicker: state.pick.firstPicker ?? "host" },
            usedWords: [],
            rounds: [],
            scores: { host: 0, guest: 0 },
            result: undefined,
          },
          "start the match"
        );
      },

      setSettings: async (partial) => {
        if (!isHost || !code || !clientId) return;
        const send = async () => {
          try {
            const res = await fetch(`/api/rooms/${code}/settings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hostId: clientId, patch: partial }),
            });
            if (!res.ok) {
              await reportFailure(res, "change that setting");
              return;
            }
            try {
              const data = (await res.json()) as { state?: PersistedGameState };
              if (data.state && applyState) applyState(data.state);
            } catch {
              /* ignore malformed body */
            }
          } catch (err) {
            reportNetworkError("change that setting", err);
          }
        };
        // Queue rather than fire: see `settingsQueue` above.
        const prev = settingsQueue.current ?? Promise.resolve();
        settingsQueue.current = prev.then(send, send);
        await settingsQueue.current;
      },

      lockMyLetter,

      advanceToRace: async () => {
        if (!isReferee || !state) return;
        if (state.phase !== "reveal") return;
        // Stamp the start time so refreshed / rejoined clients can compute
        // the correct remaining time rather than starting fresh at full.
        await postState(
          { ...state, phase: "race", raceStartedAt: Date.now() },
          "start the round"
        );
      },

      submitWord,

      timeoutRound: async () => {
        if (!isReferee || !state) return;
        if (state.phase !== "race") return; // guard against double-fire
        // If a submission landed inside the tie window, the server-side
        // resolver will commit the outcome shortly — don't overwrite it
        // with a 'none' timeout. The broadcast carries the resolved state.
        if (state.pendingResult) return;
        await postState(timedOutState(state), "end the round");
      },

      skipStalledRound: async () => {
        if (!canPlay || !state) return;
        // Pick only: the race has its own timer, and a disconnected
        // opponent is handled by the forfeit path.
        if (state.phase !== "pick") return;
        if (state.pendingResult) return;
        await postState(timedOutState(state), "skip the round");
      },

      nextRound: async () => {
        if (!isReferee || !state) return;
        // Match over — go to matchend.
        const rounds = state.settings.rounds;
        if (state.round >= rounds) {
          await postState({ ...state, phase: "matchend" }, "end the match");
          return;
        }
        const nextFirstPicker: "host" | "guest" =
          state.pick.firstPicker === "host" ? "guest" : "host";
        await postState(
          {
            ...state,
            phase: "pick",
            round: state.round + 1,
            pick: { firstPicker: nextFirstPicker },
            result: undefined,
          },
          "start the next round"
        );
      },

      replayRound: async () => {
        if (!isReferee || !state) return;
        // Valid out of a replay_pending result (sim tie + replay) or a
        // timeout when tieBehavior is 'replay' (neither submitted, round
        // re-runs). Anything else would re-roll the round needlessly.
        const reason = state.result?.reason;
        const isTimeoutReplay =
          reason === "timeout" && state.settings.tieBehavior === "replay";
        if (reason !== "replay_pending" && !isTimeoutReplay) return;
        await postState(
          {
            ...state,
            phase: "pick",
            // Same round number + same firstPicker — the round is replaying,
            // not advancing.
            pick: { firstPicker: state.pick.firstPicker },
            result: undefined,
          },
          "replay the round"
        );
      },

      rematch: async () => {
        if (!isReferee || !state) return;
        const nextFirstPicker: "host" | "guest" =
          state.pick.firstPicker === "host" ? "guest" : "host";
        await postState(
          {
            ...state,
            phase: "lobby",
            round: 0,
            scores: { host: 0, guest: 0 },
            pick: { firstPicker: nextFirstPicker },
            usedWords: [],
            rounds: [],
            result: undefined,
          },
          "start a rematch"
        );
      },

      renameMe,

      forfeitRound: async (winningSide) => {
        if (!isReferee || !state) return;
        // Pick and reveal stall forever when one side leaves (no timer runs
        // there), so the grace-period forfeit covers them too.
        if (
          state.phase !== "race" &&
          state.phase !== "pick" &&
          state.phase !== "reveal"
        ) {
          return;
        }
        if (state.pendingResult) return; // resolver in flight wins
        const scores =
          winningSide === "host"
            ? { ...state.scores, host: state.scores.host + 1 }
            : { ...state.scores, guest: state.scores.guest + 1 };
        await postState(
          {
            ...state,
            phase: "result",
            result: {
              winner: winningSide,
              reason: "forfeit",
              submittedAt: Date.now(),
            },
            rounds: appendOutcome(state, {
              round: state.round,
              winner: winningSide,
              reason: "forfeit",
            }),
            scores,
          },
          "end the round"
        );
      },
    };
  }, [state, role, canReferee, postState, code, clientId, applyState]);
}

/**
 * The "ran out of time" outcome for the current round.
 *
 * A timeout is conceptually the same as a simultaneous tie — no clear
 * winner emerged — so it applies `tieBehavior` exactly the way
 * `computeFinalState` does for a real tie, and stamps `reason: "timeout"`
 * so the result phase can label it with the "out of time" suffix. Shared by
 * the race timer and by the manual skip out of a stalled pick, so the two
 * can't drift apart.
 */
function timedOutState(state: PersistedGameState): PersistedGameState {
  const submittedAt = Date.now();
  const tieBehavior = state.settings.tieBehavior;

  if (tieBehavior === "replay") {
    // Park on the result screen so both players see the "out of time"
    // header and the words that would have worked; ResultPhase fires
    // `replayRound` once the advance bar fills. No outcome is recorded —
    // the round hasn't finished, it's about to re-run.
    return {
      ...state,
      phase: "result",
      result: { winner: "none", reason: "timeout", submittedAt },
    };
  }

  if (tieBehavior === "split") {
    return {
      ...state,
      phase: "result",
      result: { winner: "split", reason: "timeout", submittedAt },
      rounds: appendOutcome(state, {
        round: state.round,
        winner: "split",
        reason: "timeout",
      }),
      scores: {
        host: state.scores.host + 1,
        guest: state.scores.guest + 1,
      },
    };
  }

  // 'nobody' — the round ends with no points awarded.
  return {
    ...state,
    phase: "result",
    result: { winner: "none", reason: "timeout", submittedAt },
    rounds: appendOutcome(state, {
      round: state.round,
      winner: "none",
      reason: "timeout",
    }),
  };
}

/**
 * Appends a per-round outcome, replacing any existing entry for the same
 * round (a replayed round resolves twice). Drives the match-end summary,
 * which otherwise had no way to explain a round that produced no word —
 * a forfeit or timeout showed as two empty cells next to a score that had
 * silently gone up.
 */
function appendOutcome(
  state: PersistedGameState,
  outcome: NonNullable<PersistedGameState["rounds"]>[number]
): NonNullable<PersistedGameState["rounds"]> {
  const existing = state.rounds ?? [];
  return [...existing.filter((r) => r.round !== outcome.round), outcome];
}
