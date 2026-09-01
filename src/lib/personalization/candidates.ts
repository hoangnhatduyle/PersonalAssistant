export interface LowRatingFeedbackRow {
  id: string;
  scope: "course" | "task";
  targetId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface SuggestionCandidateGroup {
  scope: "course" | "task";
  targetId: string;
  feedbackIds: string[];
  ratings: { rating: number; comment: string | null; createdAt: string }[];
}

/**
 * Pure, DB-free grouping of already-fetched low-rated feedback rows by
 * their resolved target (a deadline's course_id, or a task's own id) — a
 * single bad rating is noise, not a pattern worth an LLM call, so only
 * targets with at least `minCount` recent low ratings become candidates.
 */
export function groupLowRatingFeedback(rows: LowRatingFeedbackRow[], minCount: number): SuggestionCandidateGroup[] {
  const groups = new Map<string, SuggestionCandidateGroup>();

  for (const row of rows) {
    const key = `${row.scope}:${row.targetId}`;
    const group = groups.get(key) ?? { scope: row.scope, targetId: row.targetId, feedbackIds: [], ratings: [] };
    group.feedbackIds.push(row.id);
    group.ratings.push({ rating: row.rating, comment: row.comment, createdAt: row.createdAt });
    groups.set(key, group);
  }

  return Array.from(groups.values()).filter((group) => group.ratings.length >= minCount);
}
