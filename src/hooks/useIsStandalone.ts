import { useSyncExternalStore } from "react";

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mediaQueryList = window.matchMedia(STANDALONE_QUERY);
  mediaQueryList.addEventListener("change", onStoreChange);
  return () => mediaQueryList.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  // navigator.standalone is Safari/iOS's legacy (non-matchMedia) signal for
  // an installed home-screen web app -- matchMedia's display-mode query
  // alone doesn't reliably report standalone there.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (window.matchMedia?.(STANDALONE_QUERY).matches ?? false);
}

function getServerSnapshot(): boolean {
  return false;
}

/** True once the app is confirmed running as an installed standalone PWA (never during SSR/first paint). */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
