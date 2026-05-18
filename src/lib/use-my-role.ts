"use client";

import * as React from "react";
import type { PersistedGameState } from "./game/state";

export type ResolvedRole = "host" | "guest" | "spectator" | null;

type State = {
  role: ResolvedRole;
  /** True until /me (and /join, if needed) has resolved. */
  resolving: boolean;
};

type Opts = {
  /** Room code, or null when not in a room (landing). */
  code: string | null;
  /** Caller's persistent clientId (UUID v4) or "" pre-hydration. */
  clientId: string;
  /** Display name; used by /join if the caller is claiming the guest slot. */
  name: string;
  /**
   * Optional sink for the post-claim state returned by /join. Wired to
   * `useRoomChannel`'s `applyState` so a fresh guest's `liveState`
   * reflects their own join *without* depending on the realtime
   * broadcast, which sometimes arrives during the channel re-subscribe
   * that fires when `role` flips from `null` to "guest" and is missed.
   */
  applyState?: (state: PersistedGameState) => void;
};

/**
 * Resolves the caller's role for a room and auto-claims the guest slot if
 * unoccupied.
 *
 * Flow:
 *   1. POST /me → role: 'host' | 'guest' | 'guest_unclaimed' | 'spectator'
 *   2. If 'guest_unclaimed', POST /join with name → role
 *   3. Settle on a final role
 *
 * `resolving` is derived from inputs rather than stored, so the initial
 * render (clientId="" during SSR) shows resolving=false; once the
 * useSyncExternalStore-backed clientId hydrates, the effect runs and role
 * gets set. This avoids the setState-in-effect lint while still handling
 * the post-hydration transition correctly.
 */
export function useMyRole({ code, clientId, name, applyState }: Opts): State {
  const [role, setRole] = React.useState<ResolvedRole>(null);
  // Keep `applyState` reachable inside the async resolver without
  // listing it in the effect deps — `applyState` is React's setState
  // (stable identity), but listing it would force a re-run if the
  // caller forgot to memoize. Ref avoids that footgun.
  const applyStateRef = React.useRef(applyState);
  React.useEffect(() => {
    applyStateRef.current = applyState;
  });

  React.useEffect(() => {
    if (!code || !clientId) return;
    let cancelled = false;

    (async () => {
      try {
        const meRes = await fetch(`/api/rooms/${code}/me`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        if (!meRes.ok) {
          if (!cancelled) setRole("spectator");
          return;
        }
        const meData = (await meRes.json()) as { role?: string };

        if (meData.role === "host" || meData.role === "guest") {
          if (!cancelled) setRole(meData.role);
          return;
        }
        if (meData.role === "spectator") {
          if (!cancelled) setRole("spectator");
          return;
        }
        if (meData.role !== "guest_unclaimed") {
          if (!cancelled) setRole("spectator");
          return;
        }

        const trimmedName = name.trim().slice(0, 32) || undefined;
        const joinRes = await fetch(`/api/rooms/${code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, name: trimmedName }),
        });
        if (cancelled) return;
        if (joinRes.ok) {
          const joinData = (await joinRes.json()) as {
            role?: string;
            state?: PersistedGameState;
          };
          if (joinData.role === "host" || joinData.role === "guest") {
            // Apply the post-claim state directly to the channel's
            // state cache. This guarantees the guest sees their own
            // join (name, players.guest slot filled) even if the
            // accompanying realtime broadcast is missed during the
            // channel resubscribe triggered by `role` changing.
            if (joinData.state && applyStateRef.current) {
              applyStateRef.current(joinData.state);
            }
            setRole(joinData.role);
            return;
          }
        }
        setRole("spectator");
      } catch (err) {
        console.warn("[useMyRole] resolution failed", err);
        if (!cancelled) setRole("spectator");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, clientId, name]);

  const inRoom = !!code && !!clientId;
  return {
    role: inRoom ? role : null,
    resolving: inRoom && role === null,
  };
}
