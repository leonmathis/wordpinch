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

// ── useStoredString ────────────────────────────────────────────────────
/**
 * Same shape as useStoredBool but for short strings (display names,
 * preferences). Persists under `wordpinch:v1:<shortKey>` with cross-tab sync.
 */
export function useStoredString(
  shortKey: string
): readonly [string, (next: string) => void] {
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
      return window.localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);

  const value = React.useSyncExternalStore(subscribe, getSnapshot, () => "");

  const setValue = React.useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
        window.dispatchEvent(
          new StorageEvent("storage", { key, newValue: next })
        );
      } catch {
        /* ignore */
      }
    },
    [key]
  );

  return [value, setValue] as const;
}

// ── useIsMounted ───────────────────────────────────────────────────────
const noopSubscribe = () => () => {};

/**
 * Returns `false` during SSR and the initial hydration render, then `true`
 * after commit. Use it to gate UI state that's only valid client-side
 * (e.g. a disabled flag derived from localStorage) so the server-rendered
 * HTML and the first client render match exactly.
 */
export function useIsMounted(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
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
