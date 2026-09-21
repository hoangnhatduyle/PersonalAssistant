export type SalaryPeriod = "year" | "month" | "hour";

const PERIOD_SUFFIX: Record<SalaryPeriod, string> = { year: "yr", month: "mo", hour: "hr" };

/** Mirrors the library_applications check: non-negative, and min <= max when both are given. */
export function isValidSalaryRange(min: number | null, max: number | null): boolean {
  if ((min !== null && min < 0) || (max !== null && max < 0)) return false;
  return min === null || max === null || min <= max;
}

function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
  } catch {
    // An unrecognised currency code: show the number with the code rather than throw in a render path.
    return `${currency} ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  }
}

interface SalaryInput {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

/** "$90K–$120K / yr", "From $90K / yr", "Up to $120K / yr"; null when no salary was recorded. */
export function formatSalaryRange({ min, max, currency, period }: SalaryInput): string | null {
  if (min === null && max === null) return null;
  const code = currency || "USD";
  const suffix = period ? ` / ${PERIOD_SUFFIX[period]}` : "";

  let body: string;
  if (min !== null && max !== null) {
    body = min === max ? formatAmount(min, code) : `${formatAmount(min, code)}–${formatAmount(max, code)}`;
  } else if (min !== null) {
    body = `From ${formatAmount(min, code)}`;
  } else {
    body = `Up to ${formatAmount(max as number, code)}`;
  }
  return `${body}${suffix}`;
}
