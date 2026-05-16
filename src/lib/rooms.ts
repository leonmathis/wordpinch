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
): Promise<{ host_id: string; state: PersistedGameState; language: string } | null> {
  if (!isValidCode(code)) return null;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("rooms")
    .select("host_id, state, language")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    host_id: data.host_id as string,
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
