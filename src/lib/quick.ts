import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { initialGameState, type PersistedGameState } from "./game/state";

/**
 * F7 quick match. Players wait in `match_queue`; `quick_match_pair()`
 * pairs the oldest other waiter with the caller in one transaction and
 * creates their room, already in round 1 with the fixed rules
 * (decision 4). Waiting clients poll their status; nobody but the server
 * touches the queue.
 */

/** 5 rounds, 30 s, min 4 letters, ties replayed, no slang, length bonus and no-repeat off, peek on. */
export const QUICK_SETTINGS: PersistedGameState["settings"] = {
  rounds: 5,
  roundTimerSec: 30,
  minWordLength: 4,
  tieBehavior: "replay",
  allowProperNouns: false,
  audioDefinitions: true,
  language: "en",
  lengthBonus: false,
  noRepeat: false,
  peek: true,
};

/** Waiting longer than this shows "nobody around" (the queue keeps a little slack). */
export const QUICK_TIMEOUT_MS = 60_000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function quickState(): PersistedGameState {
  const base = initialGameState();
  return {
    ...base,
    phase: "pick",
    round: 1,
    settings: QUICK_SETTINGS,
    pick: { firstPicker: "host" },
    matchStartedAt: Date.now(),
    usedLetters: [],
    peeks: {},
  };
}

export type QuickStatus =
  | { state: "idle" }
  | { state: "waiting"; waitingSince: number; waiting: number }
  | { state: "matched"; code: string; opponent: string };

/** Joins the queue, or pairs with whoever has waited longest. */
export async function joinQuick(userId: string, name: string): Promise<QuickStatus> {
  const admin = supabaseAdmin();
  const clean = name.trim().slice(0, 32) || "Someone";
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin.rpc("quick_match_pair", {
      p_user_id: userId,
      p_name: clean,
      p_code: randomCode(),
      p_state: quickState(),
    });
    // 23505: the code is taken; draw another.
    if (error?.code === "23505") continue;
    if (error) throw error;
    return quickStatus(userId);
  }
  throw new Error("no free room code for a quick match");
}

export async function quickStatus(userId: string): Promise<QuickStatus> {
  const admin = supabaseAdmin();
  const { data: me, error } = await admin
    .from("match_queue")
    .select("joined_at, matched_room")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!me) return { state: "idle" };
  if (me.matched_room) {
    const { data: other } = await admin
      .from("match_queue")
      .select("name")
      .eq("matched_room", me.matched_room)
      .neq("user_id", userId)
      .maybeSingle();
    return { state: "matched", code: me.matched_room, opponent: other?.name ?? "your rival" };
  }
  const { count } = await admin
    .from("match_queue")
    .select("user_id", { count: "exact", head: true })
    .is("matched_room", null)
    .gt("joined_at", new Date(Date.now() - 75_000).toISOString());
  return { state: "waiting", waitingSince: Date.parse(me.joined_at), waiting: count ?? 1 };
}

/** Leaves the queue (Cancel, or the page closing). A made match stays. */
export async function leaveQuick(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("match_queue").delete().eq("user_id", userId).is("matched_room", null);
  if (error) throw error;
}
