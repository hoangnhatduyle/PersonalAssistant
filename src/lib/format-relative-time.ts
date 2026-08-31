/**
 * Compact relative-time label ("in 3h", "2d ago") for dashboard widgets that
 * need to show many timestamps in a small space. Rounds to the largest
 * sensible unit (minutes under an hour, hours under a day, days beyond).
 */
export function formatRelativeTime(target: Date, now: Date = new Date()): string {
  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const absMinutes = Math.abs(diffMinutes);

  let value: number;
  let unit: string;
  if (absMinutes < 60) {
    value = absMinutes;
    unit = "m";
  } else if (absMinutes < 60 * 24) {
    value = Math.round(absMinutes / 60);
    unit = "h";
  } else {
    value = Math.round(absMinutes / (60 * 24));
    unit = "d";
  }

  return diffMinutes >= 0 ? `in ${value}${unit}` : `${value}${unit} ago`;
}
