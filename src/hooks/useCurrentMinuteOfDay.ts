import { useSyncExternalStore } from "react";

const MS_PER_MINUTE = 60_000;
const TICK_MS = 15_000;

function subscribe(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, TICK_MS);
  return () => clearInterval(id);
}

// The snapshot is the epoch minute (a stable number between minute rollovers), so React only re-renders once a minute.
function getSnapshot(): number {
  return Math.floor(Date.now() / MS_PER_MINUTE);
}

function getServerSnapshot(): null {
  return null;
}

/** Current local minutes-of-day (0–1439), refreshed each minute. `null` during SSR/hydration so the markup matches. */
export function useCurrentMinuteOfDay(): number | null {
  const epochMinute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (epochMinute === null) return null;
  const now = new Date(epochMinute * MS_PER_MINUTE);
  return now.getHours() * 60 + now.getMinutes();
}
