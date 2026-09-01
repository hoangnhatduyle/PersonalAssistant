import type { CourseRow, TaskRow } from "@/lib/api/entity-types";

/**
 * Shared between PersonalizationSuggestionsPanel's card list and
 * useReviewSuggestionsAloud's spoken sentences — both need to turn a
 * suggestion's (scope, target_id) into a human-readable name from
 * already-fetched Course/Task rows.
 */
export function resolveTargetTitle(scope: string, targetId: string, courses: CourseRow[], tasks: TaskRow[]): string {
  if (scope === "course") return courses.find((course) => course.id === targetId)?.name ?? "Untitled course";
  return tasks.find((task) => task.id === targetId)?.title ?? "Untitled task";
}
