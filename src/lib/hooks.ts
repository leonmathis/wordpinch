import * as React from "react";

const STORAGE_PREFIX = "wordpinch:v1:";

export function useStoredBool(
  shortKey: string
): readonly [boolean, (next: boolean) => void] {
  const key = STORAGE_PREFIX + shortKey;

  const subscribe = React.useCallback(
    (cb: () => void) => {
      const handler = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [key]
  );

  const getSnapshot = React.useCallback(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);

  const value = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false
  );

  const setValue = React.useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
        window.dispatchEvent(
          new StorageEvent("storage", { key, newValue: next ? "1" : "0" })
        );
      } catch {
        /* ignore */
      }
    },
    [key]
  );

  return [value, setValue] as const;
}

// ── useClientId ────────────────────────────────────────────────────────
const CLIENT_ID_KEY = STORAGE_PREFIX + "client-id";
const clientIdNoopSubscribe = () => () => {};

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/**
 * Returns the stable per-browser client UUID, generating one on first call.
 * Persisted in localStorage under `wordpinch:v1:client-id`.
 * Returns "" during SSR.
 */
export function useClientId(): string {
  return React.useSyncExternalStore(
    clientIdNoopSubscribe,
    getOrCreateClientId,
    () => ""
  );
}
