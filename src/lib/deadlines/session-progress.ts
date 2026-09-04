import type { AppointmentRow } from "@/lib/api/entity-types";

export interface SessionProgress {
  deadlineId: string;
  done: number;
  total: number;
  /** done / total, 0 when total is 0 (avoids NaN in the UI). */
  ratio: number;
}

// Only the two columns this function actually reads — Pick rather than the
// full AppointmentRow so a caller with a narrow-select query (e.g. the
// intelligence route, which doesn't fetch every appointments column) can
// pass its rows straight through without a lying full-row cast.
type SessionLike = Pick<AppointmentRow, "deadline_id" | "session_status">;

/**
 * Per-deadline session completion. Progress = done / total over ALL
 * non-deleted sessions ever created for a deadline — skipped sessions stay
 * in the denominator (total) but never count toward done, so skipping
 * without doing the work hurts the percentage until the user either flips it
 * to done or adds a make-up session. Sessions with no deadline_id (regular,
 * non-session appointments) are ignored.
 */
export function buildSessionProgress(sessions: SessionLike[]): SessionProgress[] {
  const tallyByDeadlineId = new Map<string, { done: number; total: number }>();

  for (const session of sessions) {
    if (!session.deadline_id) continue;
    const tally = tallyByDeadlineId.get(session.deadline_id) ?? { done: 0, total: 0 };
    tally.total += 1;
    if (session.session_status === "done") tally.done += 1;
    tallyByDeadlineId.set(session.deadline_id, tally);
  }

  return Array.from(tallyByDeadlineId.entries()).map(([deadlineId, tally]) => ({
    deadlineId,
    done: tally.done,
    total: tally.total,
    ratio: tally.total === 0 ? 0 : tally.done / tally.total,
  }));
}
