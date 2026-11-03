"use client";

import { useSyncExternalStore } from "react";

export const CALL_DIAGNOSTICS_STORAGE_KEY = "cadence.callDiagnostics";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` only fires for other tabs; same-tab writes notify through `listeners`.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(CALL_DIAGNOSTICS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(CALL_DIAGNOSTICS_STORAGE_KEY, "1");
    else window.localStorage.removeItem(CALL_DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // Storage blocked (private browsing): the toggle simply does not stick.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Per-device switch for the voice call diagnostics overlay, the in-app
 * equivalent of `/driving?debug=1` for an installed PWA that has no address
 * bar. localStorage-backed (a device setting, like the Face ID lock), read
 * through useSyncExternalStore so it is false during server rendering.
 */
export function useCallDiagnostics(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  return [enabled, writeEnabled];
}
