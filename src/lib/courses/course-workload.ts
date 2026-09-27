import type { CourseRow, DeadlineRow, TaskRow, TodoListRow } from "@/lib/api/entity-types";
import { isOpenDeadline, isOpenTask } from "@/lib/dashboard/upcoming-items";
import type { StatusTone } from "@/lib/status-colors";

/** Caps each of nextDeadlines/openTasks — this feeds an inline card-level preview, not a full list page. */
const PREVIEW_ITEM_LIMIT = 5;

export interface CourseWorkloadPreview {
  pendingDeadlineCount: number;
  openTaskCount: number;
  overdueDeadlineCount: number;
  urgencyTone: StatusTone;
  /** Soonest-due-first pending deadlines, capped to PREVIEW_ITEM_LIMIT. */
  nextDeadlines: DeadlineRow[];
  /** Open tasks filed under the course's Board List, capped to PREVIEW_ITEM_LIMIT. */
  openTasks: TaskRow[];
}

/**
 * Per-course workload snapshot for the Course roster's CourseCard badge and
 * expandable preview. Deadlines join by course_id directly; Tasks join via
 * list_id -> todo_lists.course_id (post board-merge) — the same two-step
 * pattern CourseDetailContainer uses for a single course, generalized here
 * across the whole visible roster in one pass to avoid an N+1 fetch per card.
 */
export function buildCourseWorkloadPreviews(
  courses: CourseRow[],
  deadlines: DeadlineRow[],
  tasks: TaskRow[],
  todoLists: TodoListRow[],
): Map<string, CourseWorkloadPreview> {
  const pendingDeadlinesByCourseId = new Map<string, DeadlineRow[]>();
  const overdueCountByCourseId = new Map<string, number>();
  for (const deadline of deadlines) {
    if (!isOpenDeadline(deadline.status)) continue;
    const bucket = pendingDeadlinesByCourseId.get(deadline.course_id) ?? [];
    bucket.push(deadline);
    pendingDeadlinesByCourseId.set(deadline.course_id, bucket);
    if (deadline.status === "Overdue") {
      overdueCountByCourseId.set(deadline.course_id, (overdueCountByCourseId.get(deadline.course_id) ?? 0) + 1);
    }
  }

  const courseIdByListId = new Map(todoLists.filter((list) => list.course_id).map((list) => [list.id, list.course_id as string]));
  const openTasksByCourseId = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!isOpenTask(task.status) || !task.list_id) continue;
    const courseId = courseIdByListId.get(task.list_id);
    if (!courseId) continue;
    const bucket = openTasksByCourseId.get(courseId) ?? [];
    bucket.push(task);
    openTasksByCourseId.set(courseId, bucket);
  }

  const previews = new Map<string, CourseWorkloadPreview>();
  for (const course of courses) {
    const pendingDeadlines = [...(pendingDeadlinesByCourseId.get(course.id) ?? [])].sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    );
    const openTasks = openTasksByCourseId.get(course.id) ?? [];
    const overdueDeadlineCount = overdueCountByCourseId.get(course.id) ?? 0;
    const pendingDeadlineCount = pendingDeadlines.length;
    const openTaskCount = openTasks.length;

    previews.set(course.id, {
      pendingDeadlineCount,
      openTaskCount,
      overdueDeadlineCount,
      urgencyTone: overdueDeadlineCount > 0 ? "urgent" : pendingDeadlineCount + openTaskCount > 0 ? "warn" : "neutral",
      nextDeadlines: pendingDeadlines.slice(0, PREVIEW_ITEM_LIMIT),
      openTasks: openTasks.slice(0, PREVIEW_ITEM_LIMIT),
    });
  }
  return previews;
}

const URGENCY_TIER: Partial<Record<StatusTone, number>> = { urgent: 0, warn: 1, neutral: 2 };

/**
 * Urgent-first ordering for the roster grid. Array.prototype.sort has been
 * stable since ES2019, so courses tied on urgency tier keep their incoming
 * relative order rather than being shuffled.
 */
export function sortCoursesByWorkloadUrgency(courses: CourseRow[], previewByCourseId: Map<string, CourseWorkloadPreview>): CourseRow[] {
  const tierOf = (course: CourseRow) => URGENCY_TIER[previewByCourseId.get(course.id)?.urgencyTone ?? "neutral"] ?? 2;
  return [...courses].sort((a, b) => tierOf(a) - tierOf(b));
}
