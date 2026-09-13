import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onStoreChange: () => void): (() => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener("change", onStoreChange);
    return () => mediaQueryList.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(query: string) {
  return (): boolean => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };
}

function getServerSnapshot(): boolean {
  return false;
}

/** SSR-safe media query match, mirroring useIsStandalone's useSyncExternalStore pattern. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribe(query), getSnapshot(query), getServerSnapshot);
}
