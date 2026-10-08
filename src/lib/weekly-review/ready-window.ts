const READY_START_HOUR_SUNDAY = 17;
const READY_END_HOUR_MONDAY = 12;

/**
 * True from Sunday 17:00 through Monday 11:59 in `timezone`: the stretch the
 * card highlights itself as "ready for review". Only a visual nudge; the
 * review is available any day.
 */
export function isWeeklyReviewReady(now: Date, timezone = "UTC"): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return (weekday === "Sun" && hour >= READY_START_HOUR_SUNDAY) || (weekday === "Mon" && hour < READY_END_HOUR_MONDAY);
}
