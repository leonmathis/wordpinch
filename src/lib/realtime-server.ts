import "server-only";

import type { PersistedGameState } from "./game/state";
import { sanitizeStateForClient } from "./game/sanitize";
import { EVENT_STATE, ROOM_CHANNEL, type RoomBroadcastPayload } from "./realtime";

/**
 * Server-side: push a state update onto the room's Realtime channel.
 *
 * Uses Supabase's HTTP Broadcast API (no persistent channel needed). Failures
 * are logged and swallowed — the DB write is the source of truth; clients
 * that miss the broadcast will pick up state on the next reconnect via the
 * server-rendered initial state.
 *
 * Calling this from a client component is a build error — the
 * `server-only` import on line 1 ensures the Next.js bundler refuses to
 * include this module in a client chunk.
 */
export async function broadcastRoomState(
  code: string,
  state: PersistedGameState
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.warn("[broadcastRoomState] Supabase env vars missing");
    return;
  }

  const payload: RoomBroadcastPayload = {
    state: sanitizeStateForClient(state),
    sentAt: Date.now(),
  };

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: ROOM_CHANNEL(code),
            event: EVENT_STATE,
            payload,
          },
        ],
      }),
      // Don't let a slow broadcast hold up the API response.
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        "[broadcastRoomState] non-2xx",
        res.status,
        text.slice(0, 200)
      );
    }
  } catch (err) {
    console.warn("[broadcastRoomState] failed", err);
  }
}
