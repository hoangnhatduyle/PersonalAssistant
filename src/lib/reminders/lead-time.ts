// Reminder lead times are stored (and validated server-side) purely in
// minutes; units exist only at the input/display edge so users can type
// "2 hours" or "1 day" instead of doing the arithmetic themselves.

export type LeadUnit = "minutes" | "hours" | "days";

export const LEAD_UNITS: ReadonlyArray<{ unit: LeadUnit; label: string; minutes: number }> = [
  { unit: "minutes", label: "minute(s)", minutes: 1 },
  { unit: "hours", label: "hour(s)", minutes: 60 },
  { unit: "days", label: "day(s)", minutes: 1440 },
];

/** 30 days. Mirrors the CHECK constraints in supabase/migrations/0044_reminder_lead_max_30_days.sql. */
export const MAX_REMINDER_LEAD_MINUTES = 43_200;

export const DEFAULT_LEAD_UNIT: LeadUnit = "minutes";

function minutesPerUnit(unit: LeadUnit): number {
  return LEAD_UNITS.find((candidate) => candidate.unit === unit)?.minutes ?? 1;
}

/** amount + unit -> minutes. NaN (an empty/invalid amount) stays NaN so a form's validator can flag it. */
export function leadToMinutes(amount: number, unit: LeadUnit): number {
  return amount * minutesPerUnit(unit);
}

/** Largest unit that divides the value evenly: 1440 -> 1 day, 120 -> 2 hours, 90 -> 90 minutes. */
export function minutesToLead(minutes: number): { amount: number; unit: LeadUnit } {
  if (!Number.isInteger(minutes) || minutes <= 0) return { amount: Number.isFinite(minutes) ? minutes : 0, unit: DEFAULT_LEAD_UNIT };
  for (const { unit, minutes: size } of [...LEAD_UNITS].reverse()) {
    if (minutes % size === 0) return { amount: minutes / size, unit };
  }
  return { amount: minutes, unit: DEFAULT_LEAD_UNIT };
}

/** "1 day", "2 hours", "90 minutes" — for cards, voice sentences and suggestions. */
export function formatLeadMinutes(minutes: number): string {
  const { amount, unit } = minutesToLead(minutes);
  const singular = unit.slice(0, -1);
  return `${amount} ${amount === 1 ? singular : unit}`;
}
