import { useSettings } from "@/hooks/useSettings";

/**
 * The IANA time zone dates should be shown in: the one saved in Settings, or
 * the device's own until the settings request has answered. Pair with
 * formatDateTime / formatDate in "@/lib/format/zoned-datetime".
 */
export function useUserTimezone(): string {
  const { data } = useSettings();
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * False until the settings request has answered (success or failure) — or is
 * known to be waiting on the network. While
 * it is false useUserTimezone() is only the device-zone fallback, so a field
 * that converts a typed date/time to an instant should wait: an instant built
 * in the fallback zone would be re-read in the real zone once settings load,
 * shifting the date by the zone difference.
 */
export function useUserTimezoneReady(): boolean {
  const { isPending, fetchStatus } = useSettings();
  // "paused" = no network (the app is installable and works offline): the request is queued, not failed, so waiting
  // would lock the fields indefinitely. Proceed on the device zone, as useUserTimezone() already falls back to.
  return !isPending || fetchStatus === "paused";
}
