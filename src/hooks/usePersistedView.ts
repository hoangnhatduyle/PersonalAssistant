"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable, so the choice still holds for the session.
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): string | null {
  const remembered = memory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Which of a fixed set of views is showing, remembered across reloads. The first entry of `views`
 * is the default. Read through useSyncExternalStore so the server render and first client render
 * agree (the default) instead of mismatching on hydration -- which is why this is not useLocalStorage.
 */
export function usePersistedView<T extends string>(key: string, views: readonly [T, ...T[]]): readonly [T, (view: T) => void] {
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
  const view = views.find((candidate) => candidate === stored) ?? views[0];

  const setView = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // localStorage may be full or disabled; the in-memory value still applies
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );
  return [view, setView] as const;
}

/** Test-only: drop the in-memory fallback so cases don't leak into each other. */
export function resetPersistedViewMemory() {
  memory.clear();
}
