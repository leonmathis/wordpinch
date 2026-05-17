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
 */
export async function updateRoomState(opts: {
  code: string;
  hostId: string;
  state: PersistedGameState;
}): Promise<boolean> {
  if (!isValidCode(opts.code)) return false;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .update({ state: opts.state })
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

  const room = await getRoomByCode(opts.code);
  if (!room) return { ok: false, reason: "not_found" };

  if (room.host_id === opts.clientId) {
    return { ok: true, role: "host", state: room.state };
  }
  if (room.guest_id === opts.clientId) {
    return { ok: true, role: "guest", state: room.state };
  }
  if (room.guest_id !== null) {
    return { ok: false, reason: "occupied" };
  }

  const safeName =
    typeof opts.name === "string" && opts.name.length > 0 && opts.name.length <= 32
      ? opts.name
      : "guest";
  const nextState: PersistedGameState = {
    ...room.state,
    players: {
      ...room.state.players,
      guest: { name: safeName },
    },
  };

  // Single UPDATE gated on guest_id IS NULL — this is the atomic claim.
  // Concurrent joiners see one winner; the others fall through to the
  // refresh-read branch below.
  const { data, error } = await admin
    .from("rooms")
    .update({ guest_id: opts.clientId, state: nextState })
    .eq("code", opts.code)
    .is("guest_id", null)
    .select("code, state")
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return { ok: true, role: "guest", state: data.state as PersistedGameState };
  }

  // Lost the race. Re-read and decide.
  const fresh = await getRoomByCode(opts.code);
  if (!fresh) return { ok: false, reason: "not_found" };
  if (fresh.guest_id === opts.clientId) {
    return { ok: true, role: "guest", state: fresh.state };
  }
  return { ok: false, reason: "occupied" };
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
  const trimmed = opts.name.trim().slice(0, 32);
  if (!trimmed) return { ok: false, reason: "forbidden" };

  const room = await getRoomByCode(opts.code);
  if (!room) return { ok: false, reason: "not_found" };

  let role: "host" | "guest";
  if (room.host_id === opts.clientId) role = "host";
  else if (room.guest_id === opts.clientId) role = "guest";
  else return { ok: false, reason: "forbidden" };

  const players = role === "host"
    ? { ...room.state.players, host: { name: trimmed } }
    : { ...room.state.players, guest: { name: trimmed } };
  const nextState: PersistedGameState = { ...room.state, players };

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("rooms")
    .update({ state: nextState })
    .eq("code", opts.code);
  if (error) throw error;
  return { ok: true, state: nextState };
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

export type SubmitWordResult =
  | { ok: true; state: PersistedGameState }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "wrong_phase"
        | "already_decided"
        | "concurrent_update";
    };

/**
 * Record a winning word submission. First valid submission wins the round —
 * subsequent calls see `result` already set and bail with already_decided.
 *
 * The optimistic-concurrency gate is `phase = 'race' AND result IS NULL` in
 * the UPDATE's WHERE. If a tied submission lands in the same millisecond and
 * both rows match, last-writer-wins on the DB; but the round broadcast
 * carries the actual winning word so the loser's client snaps to the
 * persisted state on the next broadcast. Real tie detection (within a
 * window) is a follow-up.
 */
export async function submitWinningWord(opts: {
  code: string;
  clientId: string;
  word: string;
  phonetic?: string;
  audio?: string;
  definitions?: { partOfSpeech: string; definition: string; example?: string }[];
}): Promise<SubmitWordResult> {
  if (!isValidCode(opts.code)) return { ok: false, reason: "not_found" };
  const word = opts.word.trim().toLowerCase();
  if (!word) return { ok: false, reason: "forbidden" };

  const room = await getRoomByCode(opts.code);
  if (!room) return { ok: false, reason: "not_found" };

  let role: "host" | "guest";
  if (room.host_id === opts.clientId) role = "host";
  else if (room.guest_id === opts.clientId) role = "guest";
  else return { ok: false, reason: "forbidden" };

  if (room.state.phase !== "race") {
    return { ok: false, reason: "wrong_phase" };
  }
  if (room.state.result) {
    return { ok: false, reason: "already_decided" };
  }

  const scores =
    role === "host"
      ? { ...room.state.scores, host: room.state.scores.host + 1 }
      : { ...room.state.scores, guest: room.state.scores.guest + 1 };

  const nextState: PersistedGameState = {
    ...room.state,
    phase: "result",
    result: {
      winner: role,
      word,
      phonetic: opts.phonetic,
      audio: opts.audio,
      definitions: opts.definitions,
      submittedAt: Date.now(),
    },
    usedWords: [
      ...room.state.usedWords,
      {
        round: room.state.round,
        word,
        ipa: opts.phonetic ?? "",
        by: role,
      },
    ],
    scores,
  };

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .update({ state: nextState })
    .eq("code", opts.code)
    .eq("state->>phase", "race")
    .is("state->result", null)
    .select("code")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "concurrent_update" };
  return { ok: true, state: nextState };
}
