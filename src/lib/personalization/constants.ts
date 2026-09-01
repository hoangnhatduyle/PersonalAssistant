/**
 * Tunables for the on-demand personalization suggestion engine (mirrors
 * src/lib/knowledge/constants.ts's pinned-constant convention rather than
 * leaving these thresholds implied).
 */

// A course/task only becomes a candidate once it has at least this many
// low ratings within the lookback window — a single bad rating is noise,
// not a pattern worth an LLM call and a proposed change.
export const LOW_RATING_MAX = 2;
export const LOW_RATING_LOOKBACK_DAYS = 30;
export const LOW_RATING_MIN_COUNT = 3;

// Respects an explicit Dismiss for a while instead of immediately
// re-proposing the same change on the next "check for suggestions" click.
export const DISMISSAL_COOLDOWN_DAYS = 14;

// The feedback that led to an Apply isn't consumed — it can still be within
// LOW_RATING_LOOKBACK_DAYS on the next check. Without this, the same old
// ratings could propose a further adjustment on top of a change the user
// just applied, before there's been any time to see if it helped.
export const APPLIED_COOLDOWN_DAYS = 14;

// Matches courses.reminder_lead_minutes/tasks.reminder_lead_minutes' own
// bounds (0001_init.sql) and the personalization_suggestions CHECK
// constraints (0016_personalization_suggestions.sql).
export const SUGGESTION_LEAD_MINUTES_BOUNDS = { min: 0, max: 1440 };
