"use client";

import * as React from "react";

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
export function useMyRole({ code, clientId, name }: Opts): State {
  const [role, setRole] = React.useState<ResolvedRole>(null);

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
          const joinData = (await joinRes.json()) as { role?: string };
          if (joinData.role === "host" || joinData.role === "guest") {
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
