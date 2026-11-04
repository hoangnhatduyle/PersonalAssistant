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
