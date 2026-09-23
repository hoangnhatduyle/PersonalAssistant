import type { TaskRow, TodoListRow } from "@/lib/api/entity-types";

export interface BoardProgress {
  listId: string;
  listName: string;
  done: number;
  total: number;
  /** done / total, 0 when total is 0 (avoids NaN in the UI). */
  ratio: number;
}

/**
 * Completion broken out by Board List (course-linked or freestanding
 * alike) — the list-level sibling of buildCourseProgress, which only
 * tallies list_id -> course_id. Here the list itself is the grouping key,
 * so every list with at least one Task shows up regardless of whether it's
 * tied to a course. A Task with no list_id isn't filed under any list and
 * is excluded, same convention as buildCourseProgress. Cancelled tasks are
 * excluded from both done and total, mirroring isOpenTask.
 */
export function buildBoardProgress(todoLists: TodoListRow[], tasks: TaskRow[]): BoardProgress[] {
  const tallyByListId = new Map<string, { done: number; total: number }>();

  for (const task of tasks) {
    if (task.status === "Cancelled" || !task.list_id) continue;
    const tally = tallyByListId.get(task.list_id) ?? { done: 0, total: 0 };
    tally.total += 1;
    if (task.status === "Done") tally.done += 1;
    tallyByListId.set(task.list_id, tally);
  }

  const results: BoardProgress[] = [];
  for (const list of todoLists) {
    const tally = tallyByListId.get(list.id);
    if (!tally || tally.total === 0) continue;
    results.push({ listId: list.id, listName: list.name, done: tally.done, total: tally.total, ratio: tally.done / tally.total });
  }

  return results.sort((a, b) => a.ratio - b.ratio);
}
