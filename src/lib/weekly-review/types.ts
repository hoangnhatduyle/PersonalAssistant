import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";

// Only the columns the review reads -- Pick rather than full rows so the
// loader's narrow selects pass straight through without a lying cast (same
// convention as session-progress.ts).
export type ReviewDeadline = Pick<DeadlineRow, "id" | "title" | "due_at" | "status" | "completed_at" | "course_id" | "priority">;
export type ReviewTask = Pick<TaskRow, "id" | "title" | "due_at" | "status" | "completed_at" | "priority">;
export type ReviewSession = Pick<AppointmentRow, "deadline_id" | "session_status" | "date">;

/** An open Important / Needs-action email from the latest triage (src/lib/email-triage). Subject and sender only, never the body. */
export interface ReviewEmail {
  subject: string;
  sender: string;
  bucket: "important" | "needs_action";
}

export interface WeeklyReviewRows {
  /** Open Important / Needs-action triage items, already ranked (needs action first, newest first). Absent = none loaded. */
  unresolvedEmails?: ReviewEmail[];
  /** Deadlines/Tasks completed or due inside the last window, plus every open one due before the end of the next window. */
  deadlines: ReviewDeadline[];
  tasks: ReviewTask[];
  /** Sessions dated inside either window. */
  sessions: ReviewSession[];
  /** Sessions of the deadlines due in the next window, on any date -- decides "no sessions planned". */
  sessionsForUpcomingDeadlines: ReviewSession[];
  courseNameById: Map<string, string>;
}

export interface WeeklyReviewWindow {
  timezone: string;
  /** Local "YYYY-MM-DD" of today; doubles as the review's cache key. */
  todayKey: string;
  /** Last window: today-6 .. today, inclusive. */
  lastStartKey: string;
  /** Next window: tomorrow .. tomorrow+6, inclusive. */
  nextStartKey: string;
  nextEndKeyExclusive: string;
  lastStartUtc: Date;
  /** Local midnight tomorrow: end of the last window and start of the next. */
  tomorrowStartUtc: Date;
  todayStartUtc: Date;
  nextEndUtcExclusive: Date;
}

export interface ReviewItem {
  kind: "deadline" | "task";
  id: string;
  title: string;
  /** Course name for a deadline, when it has one. */
  context: string | null;
}

export interface PastDueItem extends ReviewItem {
  daysOverdue: number;
}

export interface NextWeekItem extends ReviewItem {
  dueKey: string;
  weekday: string;
}

export interface NextWeekDay {
  dateKey: string;
  weekday: string;
  deadlineCount: number;
  taskCount: number;
  sessionCount: number;
  /** deadlineCount + taskCount -- sessions are planned time, not owed work. */
  total: number;
  /** Up to 3 titles due this day, earliest first. */
  titles: string[];
}

export interface WeeklyReviewData {
  timezone: string;
  weekKey: string;
  lastWeek: {
    completedCount: number;
    /** Items whose due date fell in the window (and has passed, or that are already done), excluding Cancelled. */
    dueCount: number;
    completedOnTime: number;
    completedLate: number;
    stillOpen: number;
    /** 0-100, or null when no completed item had both timestamps. */
    onTimeRate: number | null;
    sessions: { done: number; skipped: number; planned: number };
  };
  pending: {
    pastDueCount: number;
    /** Oldest first, capped. */
    pastDueItems: PastDueItem[];
    dueTodayCount: number;
    /** Present only when at least one Important / Needs-action email from the latest triage is still unresolved. `items` is capped; `count` is the total. */
    unresolvedEmails?: { count: number; items: ReviewEmail[] };
  };
  nextWeek: {
    days: NextWeekDay[];
    total: number;
    busiestDay: NextWeekDay | null;
    collisionDays: NextWeekDay[];
    /** Capped, soonest first. */
    items: NextWeekItem[];
    deadlinesWithoutSessions: NextWeekItem[];
  };
}

export interface WeeklyReviewResponse {
  generatedAt: string;
  weekKey: string;
  data: WeeklyReviewData;
  narrative: string;
  recommendations: string[];
}
