import { useSyncExternalStore } from "react";

const MS_PER_MINUTE = 60_000;
const TICK_MS = 15_000;

function subscribe(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, TICK_MS);
  return () => clearInterval(id);
}

// Snapshot is the epoch minute, stable between minute rollovers, so React re-renders at most once a minute.
function getSnapshot(): number {
  return Math.floor(Date.now() / MS_PER_MINUTE);
}

function getServerSnapshot(): null {
  return null;
}

/** Current time in epoch ms, floored to the minute and refreshed each minute. `null` during SSR/hydration. */
export function useNowMinute(): number | null {
  const epochMinute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return epochMinute === null ? null : epochMinute * MS_PER_MINUTE;
}
