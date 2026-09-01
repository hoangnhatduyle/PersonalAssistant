"use client";

import { useCallback, useState } from "react";

/**
 * First localStorage-backed hook in this codebase — everything else here is
 * Supabase-synced. SSR-safe (Next.js renders this on the server first, where
 * `window` doesn't exist) and tolerant of corrupt/missing stored JSON,
 * falling back to `initialValue` rather than throwing.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setAndPersist = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage full/unavailable (private browsing, quota) — the in-memory
        // value above still updates the UI for this session.
      }
    },
    [key],
  );

  return [value, setAndPersist];
}
