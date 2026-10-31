"use client";

import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * F1 identity: every player gets an anonymous Supabase account on the
 * first visit that needs one (creating or entering a room). The session
 * lives in cookies, so route handlers read the verified account id from
 * the JWT (`lib/supabase/identity.ts`) instead of trusting the body.
 *
 * Before F1 the browser's identity was a UUID in localStorage
 * (`wordpinch:v1:client-id`). Once signed in, that clientId's room seats
 * are moved onto the account (POST /api/identity/adopt) and the key is
 * removed. When anonymous sign-in fails (disabled on the project, or its
 * 30 per hour per IP limit is hit) the browser keeps playing on the
 * clientId, as before F1.
 */

const CLIENT_ID_KEY = "wordpinch:v1:client-id";

/** `account` is false while signed out and on the clientId fallback. */
type Snapshot = { id: string; account: boolean };

let snapshot: Snapshot = { id: "", account: false };
let pending: Promise<string> | null = null;
const listeners = new Set<() => void>();

function publish(id: string, account: boolean) {
  snapshot = { id, account };
  for (const l of listeners) l();
}

function readClientId(create: boolean): string {
  try {
    let id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id && create) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id ?? "";
  } catch {
    return "";
  }
}

/** Moves the old clientId's seats onto the account, then forgets it. */
async function adoptClientId(clientId: string): Promise<void> {
  try {
    const res = await fetch("/api/identity/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    // 403 means the id can never be adopted (it is an account id), so it
    // is dropped too. Anything else is retried on the next visit.
    if (res.ok || res.status === 403) {
      window.localStorage.removeItem(CLIENT_ID_KEY);
    }
  } catch (err) {
    console.warn("[identity] adopt failed", err);
  }
}

async function resolveIdentity(): Promise<Snapshot> {
  const supabase = supabaseBrowser();
  try {
    const { data } = await supabase.auth.getSession();
    let userId = data.session?.user.id ?? null;
    if (!userId) {
      const signIn = await supabase.auth.signInAnonymously();
      if (signIn.error) throw signIn.error;
      userId = signIn.data.user?.id ?? null;
    }
    if (!userId) throw new Error("no user after anonymous sign-in");
    const legacy = readClientId(false);
    if (legacy && legacy !== userId) await adoptClientId(legacy);
    return { id: userId, account: true };
  } catch (err) {
    console.warn("[identity] anonymous sign-in unavailable, using clientId", err);
    return { id: readClientId(true), account: false };
  }
}

/**
 * Signs in (once per page load) and resolves to the id to send in request
 * bodies: the account id, or the legacy clientId when sign-in failed. The
 * server ignores the body id whenever a session cookie is present.
 */
export function ensureIdentity(): Promise<string> {
  if (!pending) {
    pending = resolveIdentity().then(({ id, account }) => {
      publish(id, account);
      return id;
    });
  }
  return pending;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getSnapshot = () => snapshot.id;
const getServerSnapshot = () => "";
const getAccount = () => snapshot.account;
const getServerAccount = () => false;

/**
 * The caller's id once `ensureIdentity` has resolved, "" before (and on
 * the server). With `enabled` false nothing signs in, so pages that never
 * touch a room (landing, dev previews) create no accounts.
 */
export function useIdentity(enabled: boolean): string {
  const id = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  React.useEffect(() => {
    if (enabled) void ensureIdentity();
  }, [enabled]);
  return id;
}

/**
 * True once this browser plays on an anonymous account. Legacy clientId
 * players have no collection (F2), so the bookmark hides for them.
 */
export function useHasAccount(): boolean {
  return React.useSyncExternalStore(subscribe, getAccount, getServerAccount);
}
