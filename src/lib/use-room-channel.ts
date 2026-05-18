"use client";

import * as React from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PersistedGameState } from "./game/state";
import {
  EVENT_STATE,
  ROOM_CHANNEL,
  type RoomBroadcastPayload,
} from "./realtime";

export type ChannelStatus =
  | "connecting"
  | "subscribed"
  | "reconnecting"
  | "closed";

export type PresenceMember = {
  // Per-session random key. NEVER the client's persistent UUID — that's a
  // bearer token (matches rooms.host_id) and must not leak via channel
  // presence (which any subscriber can read).
  sessionId: string;
  name?: string;
  role?: "host" | "guest" | "spectator";
  joinedAt: number;
};

type UseRoomChannelOpts = {
  code: string | null;
  // `clientId` is here so we can guard the hook against running before it's
  // available (returns "" during SSR). It is NEVER sent to the channel.
  clientId: string;
  name?: string;
  role?: "host" | "guest" | "spectator";
  initialState?: PersistedGameState | null;
};

const supabaseSingleton = (() => {
  let client: ReturnType<typeof createBrowserClient> | null = null;
  return () => {
    if (client) return client;
    if (typeof window === "undefined") return null;
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    return client;
  };
})();

/**
 * Subscribes to a room's Realtime broadcast + presence channel.
 *
 * Returns:
 *   - `state`: latest known `PersistedGameState` (seeded from `initialState`,
 *     updated by `state` broadcast events).
 *   - `status`: channel lifecycle status — flips to "reconnecting" when the
 *     socket drops, "subscribed" once Realtime re-establishes the channel.
 *   - `presence`: list of members currently subscribed (incl. self).
 */
export function useRoomChannel(opts: UseRoomChannelOpts): {
  state: PersistedGameState | null;
  status: ChannelStatus;
  presence: PresenceMember[];
  /**
   * True once the channel has received its first presence sync. Callers
   * that read presence to drive UI (e.g. "opponent disconnected" banner)
   * should gate on this flag — `presence` starts as `[]` on mount and
   * stays empty for the first ~100–500 ms while the subscription
   * negotiates, which would otherwise look like "opponent gone".
   */
  presenceReady: boolean;
} {
  const { code, clientId, name, role, initialState } = opts;

  const [state, setState] = React.useState<PersistedGameState | null>(
    initialState ?? null
  );
  const [status, setStatus] = React.useState<ChannelStatus>("connecting");
  const [presence, setPresence] = React.useState<PresenceMember[]>([]);
  const [presenceReady, setPresenceReady] = React.useState(false);

  React.useEffect(() => {
    if (!code || !clientId) return;
    const supabase = supabaseSingleton();
    if (!supabase) return;

    const topic = ROOM_CHANNEL(code);
    // Fresh per-mount session id. NEVER use clientId here — it's a bearer
    // token and other subscribers can read presence keys + payloads.
    const sessionId = crypto.randomUUID();
    let cancelled = false;

    // `private: true` enforces Realtime authorization on `realtime.messages`
    // so the publishable-key browser client can only receive broadcasts and
    // track its own presence — it cannot publish forged `state` events on
    // behalf of the server. The HTTP-API server publisher uses the secret
    // key (service_role), which bypasses RLS and continues to work. See
    // migration `20260518000000_lock_realtime_room_channel.sql`.
    const channel: RealtimeChannel = supabase.channel(topic, {
      config: { presence: { key: sessionId }, private: true },
    });

    channel.on(
      "broadcast",
      { event: EVENT_STATE },
      ({ payload }: { payload: RoomBroadcastPayload }) => {
        if (cancelled) return;
        setState(payload.state);
      }
    );

    channel.on("presence", { event: "sync" }, () => {
      if (cancelled) return;
      const raw = channel.presenceState() as Record<
        string,
        Array<{
          name?: string;
          role?: PresenceMember["role"];
          joinedAt?: number;
        }>
      >;
      const members: PresenceMember[] = [];
      for (const key of Object.keys(raw)) {
        const first = raw[key][0];
        if (!first) continue;
        members.push({
          sessionId: key,
          name: first.name,
          role: first.role,
          joinedAt: first.joinedAt ?? Date.now(),
        });
      }
      members.sort((a, b) => a.joinedAt - b.joinedAt);
      setPresence(members);
      setPresenceReady(true);
    });

    channel.subscribe(async (s) => {
      if (cancelled) return;
      if (s === "SUBSCRIBED") {
        setStatus("subscribed");
        try {
          // Intentionally does not include clientId — it's a bearer token.
          await channel.track({
            name,
            role,
            joinedAt: Date.now(),
          });
        } catch (err) {
          console.warn("[useRoomChannel] track failed", err);
        }
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setStatus("reconnecting");
      } else if (s === "CLOSED") {
        setStatus("closed");
      }
    });

    return () => {
      cancelled = true;
      try {
        channel.untrack();
      } catch {
        /* ignore */
      }
      supabase.removeChannel(channel);
    };
  }, [code, clientId, name, role]);

  return { state, status, presence, presenceReady };
}
