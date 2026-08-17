"use client";

import * as React from "react";
import type { PersistedGameState } from "./game/state";

export type ResolvedRole = "host" | "guest" | "spectator" | null;

type State = {
  role: ResolvedRole;
  /** True until /me (and /join, if needed) has resolved. */
  resolving: boolean;
  /**
   * True when role resolution failed for a reason that isn't "this room is
   * full" — a network blip, a 5xx, a rate limit. Previously all of these
   * silently resolved to `spectator`, which quietly locked a legitimate
   * host or guest out of their own match with no message and no way back.
   */
  failed: boolean;
  /** Re-run resolution after a failure. */
  retry: () => void;
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

/** Delay before the single automatic retry after a failed resolution. */
const AUTO_RETRY_MS = 1_500;

/**
 * Resolves the caller's role for a room and auto-claims the guest slot if
 * unoccupied.
 *
 * Flow:
 *   1. POST /me → role: 'host' | 'guest' | 'guest_unclaimed' | 'spectator'
 *   2. If 'guest_unclaimed', POST /join with name → role
 *   3. Settle on a final role
 *
 * Only two outcomes produce `spectator`: the server says so, or /join
 * reports the seat is taken (403). Everything else is reported as a
 * failure the caller can retry, because "we couldn't reach the server" and
 * "you're a spectator" are very different things to tell a player.
 */
export function useMyRole({ code, clientId, name, applyState }: Opts): State {
  const [role, setRole] = React.useState<ResolvedRole>(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  // Keep `applyState` reachable inside the async resolver without
  // listing it in the effect deps — `applyState` is React's setState
  // (stable identity), but listing it would force a re-run if the
  // caller forgot to memoize. Ref avoids that footgun.
  const applyStateRef = React.useRef(applyState);
  React.useEffect(() => {
    applyStateRef.current = applyState;
  });

  const retry = React.useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (!code || !clientId) return;
    let cancelled = false;
    let autoRetry: ReturnType<typeof setTimeout> | null = null;

    const fail = () => {
      if (cancelled) return;
      // One automatic retry for transient blips; after that the caller
      // surfaces a retry control.
      if (attempt === 0) {
        autoRetry = setTimeout(() => setAttempt((n) => n + 1), AUTO_RETRY_MS);
        return;
      }
      setFailed(true);
    };

    (async () => {
      try {
        const meRes = await fetch(`/api/rooms/${code}/me`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        if (!meRes.ok) {
          fail();
          return;
        }
        const meData = (await meRes.json()) as { role?: string };

        if (meData.role === "host" || meData.role === "guest") {
          if (!cancelled) {
            setFailed(false);
            setRole(meData.role);
          }
          return;
        }
        if (meData.role === "spectator") {
          // Authoritative: both seats are held by other clients.
          if (!cancelled) {
            setFailed(false);
            setRole("spectator");
          }
          return;
        }
        if (meData.role !== "guest_unclaimed") {
          fail();
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
            setFailed(false);
            setRole(joinData.role);
            return;
          }
          fail();
          return;
        }
        if (joinRes.status === 403) {
          // Someone else claimed the seat between /me and /join.
          setFailed(false);
          setRole("spectator");
          return;
        }
        fail();
      } catch (err) {
        console.warn("[useMyRole] resolution failed", err);
        fail();
      }
    })();

    return () => {
      cancelled = true;
      if (autoRetry) clearTimeout(autoRetry);
    };
  }, [code, clientId, name, attempt]);

  const inRoom = !!code && !!clientId;
  return {
    role: inRoom ? role : null,
    resolving: inRoom && role === null && !failed,
    failed: inRoom && failed && role === null,
    retry,
  };
}
