/**
 * Date and time display in an explicit time zone.
 *
 * Every due date, reminder time and "saved on" date in the app is stored as a
 * UTC instant, and a bare toLocaleString() shows it in whatever zone the
 * device (or a server) reports. A deadline stored as 04:59 UTC (11:59 PM in
 * Detroit) was shown as "4:59 AM" the next day. These helpers always take the
 * zone the user chose in Settings (see useUserTimezone).
 */

export const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

// Newer ICU data separates the time from AM/PM with a narrow no-break space (U+202F).
// It looks like a space but breaks string comparison, copy/paste and tests.
const NARROW_NO_BREAK_SPACE = / /g;

function format(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    // An unrecognized zone name (RangeError): show the time in the device's zone rather than crash the screen.
    formatter = new Intl.DateTimeFormat("en-US", options);
  }
  return formatter.format(date).replace(NARROW_NO_BREAK_SPACE, " ");
}

/** "11/10/2026, 11:59 PM" in the given IANA zone. Empty string for an invalid date. */
export function formatDateTime(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = DATE_TIME_FORMAT): string {
  return format(value, timeZone, options);
}

/** "11/10/2026" in the given IANA zone, or whatever calendar parts `options` asks for. Empty string for an invalid date. */
export function formatDate(value: string | Date, timeZone: string, options: Intl.DateTimeFormatOptions = DATE_FORMAT): string {
  return format(value, timeZone, options);
}
