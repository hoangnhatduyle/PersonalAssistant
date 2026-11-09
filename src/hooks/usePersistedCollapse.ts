"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable, so the toggle still works for the session.
const memory = new Map<string, boolean>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): boolean {
  const remembered = memory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A collapsed/expanded flag remembered across reloads. Read through
 * useSyncExternalStore so the server render and first client render agree
 * (expanded) instead of mismatching on hydration.
 */
export function usePersistedCollapse(key: string): readonly [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, () => read(key), () => false);
  const toggle = useCallback(() => {
    const next = !read(key);
    memory.set(key, next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // localStorage may be full or disabled; the in-memory value still applies
    }
    listeners.forEach((listener) => listener());
  }, [key]);
  return [collapsed, toggle] as const;
}

/** Test-only: drop the in-memory fallback so cases don't leak into each other. */
export function resetPersistedCollapseMemory() {
  memory.clear();
}
