import type { CourseRow, DeadlineRow, TodoItemRow, TodoListRow } from "@/lib/api/entity-types";

export interface CourseProgress {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  done: number;
  total: number;
  /** done / total, 0 when total is 0 (avoids NaN in the UI). */
  ratio: number;
}

/**
 * Per-course completion, built from Deadlines (direct course_id) and To-Do
 * items (via todo_lists.course_id) — Tasks have no course_id (see
 * NextSequenceQueue) and are intentionally excluded. Todo lists with
 * course_id === null are freestanding/personal and excluded entirely: no
 * course row exists to anchor an "Other" bucket, and blending personal
 * to-dos into course-graded progress would misrepresent course completion.
 * Cancelled deadlines are excluded from both done and total — mirrors
 * isOpenDeadline treating Cancelled as non-actionable, not "incomplete work."
 */
export function buildCourseProgress(
  courses: CourseRow[],
  deadlines: DeadlineRow[],
  todoItems: TodoItemRow[],
  todoLists: TodoListRow[],
): CourseProgress[] {
  const tallyByCourseId = new Map<string, { done: number; total: number }>();

  const bump = (courseId: string, done: boolean) => {
    const tally = tallyByCourseId.get(courseId) ?? { done: 0, total: 0 };
    tally.total += 1;
    if (done) tally.done += 1;
    tallyByCourseId.set(courseId, tally);
  };

  for (const deadline of deadlines) {
    if (deadline.status === "Cancelled") continue;
    bump(deadline.course_id, deadline.status === "Completed");
  }

  const courseIdByListId = new Map(todoLists.filter((list) => list.course_id).map((list) => [list.id, list.course_id as string]));
  for (const item of todoItems) {
    const courseId = courseIdByListId.get(item.list_id);
    if (!courseId) continue;
    bump(courseId, item.is_done);
  }

  const results: CourseProgress[] = [];
  for (const course of courses) {
    const tally = tallyByCourseId.get(course.id);
    if (!tally || tally.total === 0) continue;
    results.push({
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      done: tally.done,
      total: tally.total,
      ratio: tally.done / tally.total,
    });
  }

  return results.sort((a, b) => a.ratio - b.ratio);
}
