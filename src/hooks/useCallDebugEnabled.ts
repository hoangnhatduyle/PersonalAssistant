"use client";

import { useSyncExternalStore } from "react";
import { useCallDiagnostics } from "@/hooks/useCallDiagnostics";

/**
 * `?debug=1` is read from the address bar through useSyncExternalStore (false
 * on the server) rather than useSearchParams, which would force a Suspense
 * boundary around the page for a developer-only switch. The address does not
 * change while the page is open, so there is nothing to subscribe to.
 */
const subscribeNever = () => () => undefined;
function readDebugFlag(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

/** Whether the call's developer diagnostics are switched on: `?debug=1`, or the Settings toggle. */
export function useCallDebugEnabled(): boolean {
  const fromAddress = useSyncExternalStore(subscribeNever, readDebugFlag, () => false);
  const [fromSettings] = useCallDiagnostics();
  return fromAddress || fromSettings;
}
