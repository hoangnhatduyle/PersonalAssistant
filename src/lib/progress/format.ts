/** "8 h", "2.5 h", or minutes below an hour ("45 min"); empty when there is no estimate. */
export function formatEstimateHours(hours: number | null | undefined): string {
  if (hours == null) return "";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Number(hours.toFixed(2))} h`;
}
