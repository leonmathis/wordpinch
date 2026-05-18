import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { initialGameState, type PersistedGameState } from "./game/state";

// 31 unambiguous chars (excludes I, O, 0, 1). 31^4 ≈ 923K codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}$/;

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function isValidCode(code: string): boolean {
  return CODE_REGEX.test(code);
}

const MAX_ATTEMPTS = 6;

/**
 * Inserts a new room with a unique 4-char code. Retries on unique-constraint
 * collisions up to MAX_ATTEMPTS times before throwing.
 *
 * `hostId` is stored in the dedicated `host_id` column (never persisted into
 * the public `state` JSON) and serves as the bearer token for future mutations.
 */
export async function createRoom(opts: {
  hostId: string;
  hostName?: string;
}): Promise<{ code: string; state: PersistedGameState }> {
  const admin = supabaseAdmin();
  const state = initialGameState({ hostName: opts.hostName });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    const { error } = await admin.from("rooms").insert({
      code,
      host_id: opts.hostId,
      state,
    });

    if (!error) return { code, state };

    // Postgres unique-violation code is 23505.
    if (error.code === "23505") {
      lastError = error;
      continue;
    }

    throw error;
  }

  throw new Error(
    `Failed to create unique room code after ${MAX_ATTEMPTS} attempts (${String(lastError)})`
  );
}

/**
 * Loads a room's state by code. Returns null if not found.
 * Uses the admin client to bypass any future RLS tightening.
 */
export async function getRoomByCode(
  code: string
): Promise<{
  host_id: string;
  guest_id: string | null;
  state: PersistedGameState;
  language: string;
} | null> {
  if (!isValidCode(code)) return null;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .select("host_id, guest_id, state, language")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    host_id: data.host_id as string,
    guest_id: (data.guest_id as string | null) ?? null,
    state: data.state as PersistedGameState,
    language: data.language as string,
  };
}

/**
 * Replaces a room's state, verifying the caller is the host first.
 * Returns true on success, false if the host_id didn't match or the room
 * doesn't exist.
 *
 * Pick-letter preservation: locked letters are server-private during the
 * `pick` phase (clients receive a sanitized state without them — see
 * `sanitizeStateForClient`). A host calling `/state` while both phases are
 * `pick` would otherwise round-trip the stripped state back and wipe the
 * server's record, so when we're staying within `pick` we ignore the
 * client-supplied letters and carry the server's forward. Transitions
 * *into* or *out of* pick (startMatch, nextRound, lockPlayerLetter's
 * reveal flip) are unaffected.
 *
 * Matchend score preservation: a late-arriving near-miss can change scores
 * after the host's local `liveState` snapshot but before their
 * `nextRound` → matchend POST lands. Without this guard the host would
 * write back stale scores and the matchend screen would flash
 * "you won" → "tied" the moment the near-miss broadcast caught up.
 * On the matchend transition we always take `scores` and `usedWords`
 * from the current DB row, ignoring whatever the client sent — the
 * client never holds authoritative score info anyway.
 */
export async function updateRoomState(opts: {
  code: string;
  hostId: string;
  state: PersistedGameState;
}): Promise<boolean> {
  if (!isValidCode(opts.code)) return false;
  const admin = supabaseAdmin();

  let stateToWrite: PersistedGameState = opts.state;
  if (opts.state.phase === "pick" || opts.state.phase === "matchend") {
    const current = await admin
      .from("rooms")
      .select("state")
      .eq("code", opts.code)
      .eq("host_id", opts.hostId)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return false;
    const currentState = current.data.state as PersistedGameState;
    if (opts.state.phase === "pick" && currentState.phase === "pick") {
      stateToWrite = {
        ...opts.state,
        pick: {
          ...opts.state.pick,
          hostLetter: currentState.pick.hostLetter,
          guestLetter: currentState.pick.guestLetter,
        },
      };
    } else if (opts.state.phase === "matchend") {
      stateToWrite = {
        ...opts.state,
        scores: currentState.scores,
        usedWords: currentState.usedWords,
      };
    }
  }

  const { data, error } = await admin
    .from("rooms")
    .update({ state: stateToWrite })
    .eq("code", opts.code)
    .eq("host_id", opts.hostId)
    .select("code")
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export type ClaimResult =
  | { ok: true; role: "host" | "guest"; state: PersistedGameState }
  | { ok: false; reason: "not_found" | "occupied" };

/**
 * Atomically claim the guest slot for a clientId.
 *
 * - If the caller already owns the host slot → returns host (idempotent).
 * - If the caller already owns the guest slot → returns guest (idempotent).
 * - If guest_id is NULL → atomically set it to the caller (single UPDATE
 *   with `guest_id IS NULL` in WHERE → wins the race, loser sees occupied).
 * - Otherwise the slot is taken by someone else → spectator (occupied).
 *
 * We also write the caller's display name into `state.players.guest` so the
 * lobby shows the guest immediately, without waiting for a separate state
 * broadcast.
 */
export async function claimGuestSlot(opts: {
  code: string;
  clientId: string;
  name?: string;
}): Promise<ClaimResult> {
  if (!isValidCode(opts.code)) return { ok: false, reason: "not_found" };
  const admin = supabaseAdmin();

  // Delegates to the `claim_guest_slot` Postgres function, which holds a
  // row lock + uses jsonb_set so a concurrent host write to `state` can't
  // be clobbered by our claim. See migration 20260517124906_dual_auth_rpcs.
  const { data, error } = await admin.rpc("claim_guest_slot", {
    p_code: opts.code,
    p_client_id: opts.clientId,
    p_name: opts.name ?? "",
  });
  if (error) throw error;
  const result = data as
    | { ok: true; role: "host" | "guest"; state: PersistedGameState }
    | { ok: false; reason: "not_found" | "occupied" };
  if (!result.ok) return result;
  return { ok: true, role: result.role, state: result.state };
}

export type RenameResult =
  | { ok: true; state: PersistedGameState }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Rename the caller's own player slot. Either player can call this; the
 * server resolves role from clientId vs host_id / guest_id and writes to
 * `state.players[role].name`. Other state fields are preserved from the
 * pre-update read — same read-modify-write window as `claimGuestSlot`
 * (small in practice; the lobby is the typical rename surface and there
 * are no other host mutations happening there).
 */
export async function renamePlayer(opts: {
  code: string;
  clientId: string;
  name: string;
}): Promise<RenameResult> {
  if (!isValidCode(opts.code)) return { ok: false, reason: "not_found" };

  // Delegates to the `rename_player` Postgres function — same row-lock +
  // jsonb_set pattern as claim_guest_slot. The function handles trimming,
  // length capping, and rejects empty names.
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("rename_player", {
    p_code: opts.code,
    p_client_id: opts.clientId,
    p_name: opts.name,
  });
  if (error) throw error;
  const result = data as
    | { ok: true; state: PersistedGameState }
    | { ok: false; reason: "not_found" | "forbidden" };
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, state: result.state };
}

export type LockLetterResult =
  | { ok: true; state: PersistedGameState }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "wrong_phase"
        | "already_locked"
        | "concurrent_update";
    };

const LETTER_REGEX = /^[A-Z]$/;

/**
 * Set the caller's letter for the current round. Either player can call this
 * to set their own letter; the other player's letter is preserved.
 *
 * Race-safe via per-slot optimistic concurrency: the UPDATE's WHERE pins on
 * the **other** player's slot still holding exactly the value we observed.
 * If they locked between our read and our write, the WHERE fails and we
 * retry — re-read, see their letter, and write with both letters present
 * (which also flips phase → 'reveal').
 *
 * The naive `WHERE phase='pick'` gate had a both-empty race: two concurrent
 * locks both observed an empty pick, both passed the WHERE, and the second
 * UPDATE clobbered the first player's letter. That manifested in round 2+
 * (both clients enter `pick` simultaneously after the result auto-advance).
 */
export async function lockPlayerLetter(opts: {
  code: string;
  clientId: string;
  letter: string;
}): Promise<LockLetterResult> {
  if (!isValidCode(opts.code)) return { ok: false, reason: "not_found" };
  const letter = opts.letter.toUpperCase();
  if (!LETTER_REGEX.test(letter)) {
    return { ok: false, reason: "forbidden" };
  }

  const admin = supabaseAdmin();

  // Up to 3 attempts. Each attempt re-reads state so we always build the
  // correct nextState; the WHERE clause catches concurrent writes.
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await getRoomByCode(opts.code);
    if (!room) return { ok: false, reason: "not_found" };

    let role: "host" | "guest";
    if (room.host_id === opts.clientId) role = "host";
    else if (room.guest_id === opts.clientId) role = "guest";
    else return { ok: false, reason: "forbidden" };

    if (room.state.phase !== "pick") {
      return { ok: false, reason: "wrong_phase" };
    }

    const myKey: "hostLetter" | "guestLetter" =
      role === "host" ? "hostLetter" : "guestLetter";
    const otherKey: "hostLetter" | "guestLetter" =
      role === "host" ? "guestLetter" : "hostLetter";

    if (room.state.pick[myKey]) {
      return { ok: false, reason: "already_locked" };
    }

    const observedOther = room.state.pick[otherKey];
    const nextPick = { ...room.state.pick, [myKey]: letter };
    const bothLocked = !!nextPick.hostLetter && !!nextPick.guestLetter;
    const nextState: PersistedGameState = {
      ...room.state,
      pick: nextPick,
      ...(bothLocked ? { phase: "reveal" as const } : {}),
    };

    // The other player's slot must still be what we just read. If they
    // locked in the meantime, the WHERE fails and we loop.
    // PostgREST jsonb path: state->pick->>otherKey returns text (NULL when
    // absent), so `.is(..., null)` and `.eq(..., 'X')` both work.
    const otherPath = `state->pick->>${otherKey}`;
    let query = admin
      .from("rooms")
      .update({ state: nextState })
      .eq("code", opts.code)
      .eq("state->>phase", "pick");
    query = observedOther
      ? query.eq(otherPath, observedOther)
      : query.is(otherPath, null);

    const { data, error } = await query.select("code").maybeSingle();
    if (error) throw error;
    if (data) return { ok: true, state: nextState };
    // WHERE failed → other player moved. Retry with fresh read.
  }
  return { ok: false, reason: "concurrent_update" };
}

type PendingAttempt = NonNullable<PersistedGameState["pendingResult"]>["attempts"][number];

/**
 * Length-bonus award per submitted word: 0.5 for every letter beyond
 * `minWordLength`. Returns 0 when the bonus setting is disabled, when
 * the word doesn't exceed the minimum, or when the word is missing.
 * Centralized so the resolver and the near-miss path agree on the
 * formula (and so changing it later is a one-file edit).
 */
function lengthBonus(
  word: string | undefined,
  settings: PersistedGameState["settings"]
): number {
  if (!settings.lengthBonus || !word) return 0;
  const extra = word.length - settings.minWordLength;
  return extra > 0 ? extra * 0.5 : 0;
}

/**
 * How long after a solo-winner result is committed we'll still accept the
 * loser's submission as a "near miss" (informational only — no score
 * change). Sized to comfortably cover the auto-advance window
 * (result-phase shows for ~5.2 s before nextRound fires) so any
 * submission the loser fired before the next round starts gets credited
 * — the client-side phase-hold during in-flight submits delivers that
 * "submitted before the screen appeared" promise, and this just makes
 * sure the server doesn't reject the late half of that race.
 */
const NEAR_MISS_WINDOW_MS = 5000;

/**
 * Wall-clock submission time → milliseconds elapsed since the round's
 * race started. Used to stamp `usedWords[].timeMs` so the match-end
 * summary can show how fast each player was. Returns undefined if the
 * round somehow has no `raceStartedAt` (defensive — shouldn't happen
 * for any submission that reached this code path).
 */
function relativeMs(
  state: PersistedGameState,
  submittedAt: number
): number | undefined {
  return state.raceStartedAt
    ? Math.max(0, submittedAt - state.raceStartedAt)
    : undefined;
}

/**
 * Append a late-arriving submission to `result.attempts`. Used when the
 * loser's `/submit` lands after `resolveRound` has already committed a
 * solo winner, but within {@link NEAR_MISS_WINDOW_MS}. The result phase
 * uses this to render both words side-by-side with a "won by N ms"
 * timing diff.
 */
async function recordNearMiss(opts: {
  code: string;
  room: NonNullable<Awaited<ReturnType<typeof getRoomByCode>>>;
  role: "host" | "guest";
  word: string;
  phonetic?: string;
}): Promise<RecordAttemptResult> {
  const { room, role } = opts;
  const result = room.state.result;
  if (!result || !result.attempts) {
    return { ok: false, reason: "already_decided" };
  }
  const existing = result.attempts;
  if (existing.some((a) => a.by === role)) {
    return { ok: false, reason: "already_decided" };
  }
  const word = opts.word.trim().toLowerCase();
  const submittedAt = Date.now();
  const newAttempts = [
    ...existing,
    {
      by: role,
      word,
      ipa: opts.phonetic,
      submittedAt,
    },
  ];
  // Also append to usedWords so the loser's valid attempt shows up in
  // the match-end round summary alongside the winner's, with the same
  // time-relative stamp as a normal submission.
  const newUsedWords = [
    ...room.state.usedWords,
    {
      round: room.state.round,
      word,
      ipa: opts.phonetic ?? "",
      by: role,
      timeMs: relativeMs(room.state, submittedAt),
    },
  ];
  // Award the near-miss loser the length bonus (no base point — only
  // the actual round winner gets the +1). With the setting off this is
  // a no-op since lengthBonus() returns 0.
  const bonus = lengthBonus(word, room.state.settings);
  const nextScores =
    bonus > 0
      ? role === "host"
        ? { ...room.state.scores, host: room.state.scores.host + bonus }
        : { ...room.state.scores, guest: room.state.scores.guest + bonus }
      : room.state.scores;
  const nextState: PersistedGameState = {
    ...room.state,
    result: { ...result, attempts: newAttempts },
    usedWords: newUsedWords,
    scores: nextScores,
  };
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .update({ state: nextState })
    .eq("code", opts.code)
    .eq("state->>phase", "result")
    // Guard: only update if attempts is still the single-attempt array
    // we read. Cheap optimistic concurrency — accepts losing a rare
    // double-late submission rather than carrying lock complexity here.
    .select("code")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "too_late" };
  return { ok: true, isFirst: false, role, state: nextState };
}

export type RecordAttemptResult =
  | { ok: true; isFirst: boolean; role: "host" | "guest"; state: PersistedGameState }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "wrong_phase"
        | "already_decided"
        | "too_late";
    };

/**
 * Records a player's submission attempt during the race phase. There are two
 * possible outcomes:
 *
 *  - **First submission of the round** — atomically claims `pendingResult`
 *    (UPDATE gated on `pendingResult IS NULL`). The caller is told they're
 *    first via `isFirst: true`, and must schedule the resolver
 *    (typically via `after()` so the response can return immediately).
 *  - **Subsequent submission within the tie window** — appends to
 *    `pendingResult.attempts`. The resolver started by the first submitter
 *    will see both attempts and apply the configured tieBehavior.
 *
 * If the round has already been resolved by the time we get here (phase has
 * moved off 'race', or result is already set), returns `too_late` /
 * `already_decided` — these are 409s on the wire, handled benignly by the
 * client. The 60s timeout path coexists; if it fires first, the resolver's
 * conditional UPDATE no-ops.
 */
export async function recordAttempt(opts: {
  code: string;
  clientId: string;
  word: string;
  phonetic?: string;
  audio?: string;
  definitions?: { partOfSpeech: string; definition: string; example?: string }[];
}): Promise<RecordAttemptResult> {
  if (!isValidCode(opts.code)) return { ok: false, reason: "not_found" };
  const word = opts.word.trim().toLowerCase();
  if (!word) return { ok: false, reason: "forbidden" };

  const admin = supabaseAdmin();
  const room = await getRoomByCode(opts.code);
  if (!room) return { ok: false, reason: "not_found" };

  let role: "host" | "guest";
  if (room.host_id === opts.clientId) role = "host";
  else if (room.guest_id === opts.clientId) role = "guest";
  else return { ok: false, reason: "forbidden" };

  // Near-miss capture: round already resolved as a solo winner, but the
  // loser's submission is arriving shortly after. Append it to
  // result.attempts so the UI can show a "won by N ms" view. The
  // append is informational only — no score change, no usedWords
  // change, no winner change.
  if (
    room.state.phase === "result" &&
    room.state.result &&
    (room.state.result.winner === "host" || room.state.result.winner === "guest") &&
    room.state.result.attempts?.length === 1 &&
    room.state.result.attempts[0].by !== role
  ) {
    const winnerAt = room.state.result.attempts[0].submittedAt;
    if (Date.now() - winnerAt <= NEAR_MISS_WINDOW_MS) {
      return await recordNearMiss({
        code: opts.code,
        room,
        role,
        word,
        phonetic: opts.phonetic,
      });
    }
  }

  if (room.state.phase !== "race") {
    return { ok: false, reason: "wrong_phase" };
  }
  if (room.state.result) {
    return { ok: false, reason: "already_decided" };
  }

  const attempt: PendingAttempt = {
    by: role,
    word,
    phonetic: opts.phonetic,
    audio: opts.audio,
    definitions: opts.definitions,
    submittedAt: Date.now(),
  };

  // First-submission path: atomic claim. Single UPDATE gated on
  // pendingResult being null. Wins are serialized; the loser falls through.
  if (!room.state.pendingResult) {
    const nextState: PersistedGameState = {
      ...room.state,
      pendingResult: { attempts: [attempt] },
    };
    const { data, error } = await admin
      .from("rooms")
      .update({ state: nextState })
      .eq("code", opts.code)
      .eq("state->>phase", "race")
      .is("state->pendingResult", null)
      .select("code")
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { ok: true, isFirst: true, role, state: nextState };
    }
    // Lost the first-claim race — somebody else got there first.
    // Fall through to the append path below with a fresh read.
  }

  // Append path: somebody (maybe us, on a retry) is already first.
  const fresh = await getRoomByCode(opts.code);
  if (!fresh) return { ok: false, reason: "not_found" };
  if (fresh.state.phase !== "race") return { ok: false, reason: "too_late" };
  if (!fresh.state.pendingResult) {
    // Window already resolved between our two reads. Treat as too late.
    return { ok: false, reason: "too_late" };
  }
  // Idempotency: if our role has already submitted (we're a retry), bail.
  if (fresh.state.pendingResult.attempts.some((a) => a.by === role)) {
    return { ok: false, reason: "already_decided" };
  }
  const newAttempts = [...fresh.state.pendingResult.attempts, attempt];
  const nextState: PersistedGameState = {
    ...fresh.state,
    pendingResult: { ...fresh.state.pendingResult, attempts: newAttempts },
  };
  const { data, error } = await admin
    .from("rooms")
    .update({ state: nextState })
    .eq("code", opts.code)
    .eq("state->>phase", "race")
    .select("code")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "too_late" };
  return { ok: true, isFirst: false, role, state: nextState };
}

/**
 * Computes the next state from the active pending attempts. Pure function —
 * no I/O, easy to test. Called by `resolveRound` after the tie window
 * elapses.
 */
function computeFinalState(
  state: PersistedGameState,
  attempts: PendingAttempt[]
): PersistedGameState {
  // Strip pendingResult on every return path so a follow-up race start
  // doesn't see stale attempts.
  const base = { ...state, pendingResult: undefined };

  if (attempts.length === 0) {
    // Shouldn't normally happen — resolver only runs when pendingResult is
    // set. Treat as timeout for safety.
    return {
      ...base,
      phase: "result",
      result: { winner: "none", reason: "timeout", submittedAt: Date.now() },
    };
  }

  if (attempts.length === 1) {
    const a = attempts[0];
    const winnerAward = 1 + lengthBonus(a.word, state.settings);
    return {
      ...base,
      phase: "result",
      result: {
        winner: a.by,
        word: a.word,
        phonetic: a.phonetic,
        audio: a.audio,
        definitions: a.definitions,
        submittedAt: a.submittedAt,
        // Seed `attempts` with the winner so a late submission from the
        // loser (during the near-miss window) can be appended here for
        // the "won by N ms" display.
        attempts: [
          {
            by: a.by,
            word: a.word,
            ipa: a.phonetic,
            submittedAt: a.submittedAt,
          },
        ],
      },
      usedWords: [
        ...state.usedWords,
        {
          round: state.round,
          word: a.word,
          ipa: a.phonetic ?? "",
          by: a.by,
          timeMs: relativeMs(state, a.submittedAt),
        },
      ],
      scores:
        a.by === "host"
          ? { ...state.scores, host: state.scores.host + winnerAward }
          : { ...state.scores, guest: state.scores.guest + winnerAward },
    };
  }

  // Tie: ≥ 2 attempts within the window. Resolve per setting.
  const sorted = [...attempts].sort((a, b) => a.submittedAt - b.submittedAt);
  const first = sorted[0];
  const tieBehavior = state.settings.tieBehavior;

  // Both `split` and `replay` need the per-player attempts to render the
  // side-by-side display, so we pre-compute that once. `submittedAt` is
  // carried through so the UI can show timing diffs where useful.
  const attemptsForDisplay = sorted.map((a) => ({
    by: a.by,
    word: a.word,
    ipa: a.phonetic,
    submittedAt: a.submittedAt,
  }));

  // Per-side bonus from each player's own attempt. Sorted may contain
  // 1+ attempts per side in theory, but in practice the resolver only
  // sees one per side (recordAttempt is idempotent per role). Pick the
  // first attempt per side for the bonus calc.
  const hostAttempt = sorted.find((a) => a.by === "host");
  const guestAttempt = sorted.find((a) => a.by === "guest");
  const hostBonus = lengthBonus(hostAttempt?.word, state.settings);
  const guestBonus = lengthBonus(guestAttempt?.word, state.settings);

  if (tieBehavior === "split") {
    return {
      ...base,
      phase: "result",
      result: {
        winner: "split",
        word: first.word,
        phonetic: first.phonetic,
        audio: first.audio,
        definitions: first.definitions,
        submittedAt: first.submittedAt,
        attempts: attemptsForDisplay,
      },
      usedWords: [
        ...state.usedWords,
        ...sorted.map((a) => ({
          round: state.round,
          word: a.word,
          ipa: a.phonetic ?? "",
          by: a.by,
          timeMs: relativeMs(state, a.submittedAt),
        })),
      ],
      scores: {
        host: state.scores.host + 1 + hostBonus,
        guest: state.scores.guest + 1 + guestBonus,
      },
    };
  }

  if (tieBehavior === "nobody") {
    // Per user decision: the length bonus still rewards both submitters
    // here, just without the base win point. So a tied-nobody round
    // with bonus enabled isn't necessarily 0/0 — the longer word still
    // pays out something.
    return {
      ...base,
      phase: "result",
      result: {
        winner: "none",
        reason: "tied_nobody",
        submittedAt: Date.now(),
        attempts: attemptsForDisplay,
      },
      usedWords: [
        ...state.usedWords,
        ...sorted.map((a) => ({
          round: state.round,
          word: a.word,
          ipa: a.phonetic ?? "",
          by: a.by,
          timeMs: relativeMs(state, a.submittedAt),
        })),
      ],
      scores: {
        host: state.scores.host + hostBonus,
        guest: state.scores.guest + guestBonus,
      },
    };
  }

  // "replay" — pause on a result screen so both players see what tied,
  // then the host's client fires `replayRound` which clears pick/result
  // and sends the round back to pick. We deliberately do *not* update
  // usedWords or scores here; the words remain available for the retry.
  return {
    ...base,
    phase: "result",
    result: {
      winner: "split", // for the "both" framing in the title + delta logic
      reason: "replay_pending",
      submittedAt: Date.now(),
      attempts: attemptsForDisplay,
    },
  };
}

/**
 * Reads current state and commits the resolved outcome. Called by the
 * `/submit` route's `after()` callback after a 200ms sleep so the tie
 * window can collect a second submission.
 *
 * The UPDATE is gated on `phase = 'race' AND pendingResult IS NOT NULL` so
 * a concurrent timeout (which sets phase='result' itself) safely no-ops the
 * resolver — first one wins, the rest see WHERE failure.
 */
export async function resolveRound(opts: {
  code: string;
}): Promise<{ state: PersistedGameState } | null> {
  const room = await getRoomByCode(opts.code);
  if (!room) return null;

  // If the timeout (or another resolver) already handled this round,
  // there's nothing to do.
  if (room.state.phase !== "race" || !room.state.pendingResult) {
    return { state: room.state };
  }

  const finalState = computeFinalState(room.state, room.state.pendingResult.attempts);
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .update({ state: finalState })
    .eq("code", opts.code)
    .eq("state->>phase", "race")
    .not("state->pendingResult", "is", null)
    .select("code")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Someone else (timeout or competing resolver) already wrote. Return
    // the latest persisted state so the caller broadcasts whatever's
    // authoritative.
    const fresh = await getRoomByCode(opts.code);
    return fresh ? { state: fresh.state } : null;
  }
  return { state: finalState };
}
