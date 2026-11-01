"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/client";

/**
 * F3 reactions, cheers and the opponent's letter count, on the room's
 * `fx:<CODE>` topic (migration `20261031140000_room_fx_channel`).
 *
 * Everything here is cosmetic. Any client may broadcast on this topic, so
 * every message is checked on arrival: a reaction is an id from REACTIONS
 * (never free text) and a letter count is a small integer for a given
 * round (never the letters). Presence can't carry this: Realtime allows a
 * client 5 presence events per 30 s.
 */

export const FX_CHANNEL = (code: string) => `fx:${code.toUpperCase()}`;

import { REACTIONS, type FxRole, type ReactionId, type Seat } from "./game/reactions";

export { CHEERS, PLAYER_REACTIONS, REACTIONS, reactionText } from "./game/reactions";
export type { FxRole, ReactionId, Seat } from "./game/reactions";

export type Incoming = { id: ReactionId; from: FxRole; at: number };
export type Typed = { round: number; len: number };

const TYPING_EVERY_MS = 250;
/** A reaction button rests this long after a tap. */
export const REACTION_COOLDOWN_MS = 1500;
const MAX_LEN = 50;

const isRole = (v: unknown): v is FxRole => v === "host" || v === "guest" || v === "spectator";
const isReaction = (v: unknown): v is ReactionId => typeof v === "string" && Object.hasOwn(REACTIONS, v);

export type RoomFx = {
  /** Latest reaction or cheer from someone else, null until one arrives. */
  incoming: Incoming | null;
  /** Letter counts by seat, as last reported (check `round` before use). */
  typed: Partial<Record<Seat, Typed>>;
  react: (id: ReactionId) => void;
  /** Report this player's letter count; sends at most 4 a second. */
  typing: (round: number, len: number) => void;
};

/**
 * Joins `fx:<code>` while `code` is set. `me` is the viewer's role; a
 * spectator can only cheer and a player only react, matching the buttons.
 */
export function useRoomFx(code: string | null, me: FxRole | null): RoomFx {
  const [incoming, setIncoming] = React.useState<Incoming | null>(null);
  const [typed, setTyped] = React.useState<Partial<Record<Seat, Typed>>>({});
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const meRef = React.useRef(me);
  React.useEffect(() => {
    meRef.current = me;
  });

  React.useEffect(() => {
    if (!code) return;
    const supabase = supabaseBrowser();
    let cancelled = false;
    const channel = supabase.channel(FX_CHANNEL(code), { config: { private: true } });

    channel.on("broadcast", { event: "react" }, ({ payload }) => {
      if (cancelled || !payload || typeof payload !== "object") return;
      const { id, from } = payload as { id?: unknown; from?: unknown };
      if (!isReaction(id) || !isRole(from)) return;
      // A cheer only counts from a spectator, a reaction only from a seat.
      if ((REACTIONS[id].by === "spectator") !== (from === "spectator")) return;
      setIncoming({ id, from, at: Date.now() });
    });

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (cancelled || !payload || typeof payload !== "object") return;
      const { from, round, len } = payload as { from?: unknown; round?: unknown; len?: unknown };
      if (from !== "host" && from !== "guest") return;
      if (!Number.isInteger(round) || !Number.isInteger(len)) return;
      const n = len as number;
      if (n < 0 || n > MAX_LEN) return;
      setTyped((prev) => ({ ...prev, [from]: { round: round as number, len: n } }));
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        // The fx policy isn't on this project yet, or the socket dropped:
        // the game carries on without reactions.
        console.warn("[room-fx] channel unavailable");
      }
    });
    channelRef.current = channel;

    return () => {
      cancelled = true;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [code]);

  const send = React.useCallback((event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event, payload }).catch(() => {});
  }, []);

  const react = React.useCallback(
    (id: ReactionId) => {
      const from = meRef.current;
      if (!from) return;
      send("react", { id, from });
    },
    [send]
  );

  // Leading and trailing throttle: the first keystroke goes at once, then
  // at most one message per TYPING_EVERY_MS carrying the latest count.
  const lastSentRef = React.useRef(0);
  const pendingRef = React.useRef<{ round: number; len: number } | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = React.useCallback(() => {
    timerRef.current = null;
    const next = pendingRef.current;
    const from = meRef.current;
    if (!next || (from !== "host" && from !== "guest")) return;
    pendingRef.current = null;
    lastSentRef.current = Date.now();
    send("typing", { from, round: next.round, len: next.len });
  }, [send]);
  const typing = React.useCallback(
    (round: number, len: number) => {
      pendingRef.current = { round, len: Math.max(0, Math.min(MAX_LEN, len)) };
      if (timerRef.current) return;
      const wait = Math.max(0, TYPING_EVERY_MS - (Date.now() - lastSentRef.current));
      timerRef.current = setTimeout(flush, wait);
    },
    [flush]
  );
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { incoming, typed, react, typing };
}
