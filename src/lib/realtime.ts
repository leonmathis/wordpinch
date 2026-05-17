import type { PersistedGameState } from "./game/state";

/**
 * Client-safe Realtime channel constants + types.
 *
 * The server-only `broadcastRoomState` (which uses SUPABASE_SECRET_KEY)
 * lives in `./realtime-server.ts` and carries the `server-only` marker.
 * Keeping them separate ensures a future accidental client import of the
 * broadcaster fails at build time rather than silently bundling the
 * server-keyed code into the browser.
 */

export const ROOM_CHANNEL = (code: string) => `room:${code.toUpperCase()}`;
export const EVENT_STATE = "state";

export type RoomBroadcastPayload = {
  state: PersistedGameState;
  // Server timestamp at the moment the broadcast was sent.
  // Clients use this to compute the round timer / countdown relative to a
  // common clock instead of their local Date.now().
  sentAt: number;
};
