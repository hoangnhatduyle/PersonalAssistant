/** Library (employers): the application pipeline. Any-to-any moves; see resolveApplicationTransition. */

export const APPLICATION_STATUSES = ["interested", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ACTIVE_STATUSES = ["interested", "applied", "interviewing", "offer"] as const satisfies readonly ApplicationStatus[];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  interested: "Interested",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** Rejected / withdrawn applications are closed: they stay on record but drop out of the "where do I stand" summary. */
export function isActiveStatus(status: ApplicationStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

const MS_PER_DAY = 86_400_000;

/** Whole days since the status last changed; 0 for a future or unparsable timestamp. */
export function daysInStage(changedAt: string | Date, now: Date = new Date()): number {
  const changed = changedAt instanceof Date ? changedAt.getTime() : Date.parse(changedAt);
  if (!Number.isFinite(changed)) return 0;
  return Math.max(0, Math.floor((now.getTime() - changed) / MS_PER_DAY));
}

export function funnelCounts(applications: readonly { status: ApplicationStatus }[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
  for (const application of applications) counts[application.status] += 1;
  return counts;
}

/**
 * The single status a list row shows for an employer: its most advanced
 * active application, else rejected (over withdrawn) when everything is
 * closed, else null when there are no applications at all.
 */
export function employerSummary(applications: readonly { status: ApplicationStatus }[]): ApplicationStatus | null {
  if (applications.length === 0) return null;
  const active = ACTIVE_STATUSES.filter((status) => applications.some((application) => application.status === status));
  if (active.length > 0) return active[active.length - 1];
  return applications.some((application) => application.status === "rejected") ? "rejected" : "withdrawn";
}
