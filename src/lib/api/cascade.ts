import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface CourseDeleteCascadeResult {
  deadlinesAffected: number;
  remindersDismissed: number;
  notesUnlinked: number;
  todoItemsAffected: number;
  suggestionsDismissed: number;
}

/**
 * SPEC-API-004 AC-7/AC-12/AC-13, NC-API-008: soft-deletes a Course and, in
 * the same DB transaction (see supabase/migrations/0002_delete_cascade.sql),
 * cascades to soft-delete its live Deadlines (dismissing their Reminders)
 * and clears linked_course_id on any Note referencing it. Returns the
 * cascade's scope so the route response — and, per Tracked debt, the Item 5
 * voice confirm copy — can disclose it rather than silently performing an
 * unbounded cascade.
 */
export async function cascadeDeleteCourse(
  supabase: SupabaseClient<Database>,
  courseId: string,
): Promise<CourseDeleteCascadeResult> {
  const { data, error } = await supabase.rpc("soft_delete_course_cascade", { p_course_id: courseId }).single();
  if (error) throw error;

  return {
    deadlinesAffected: data.deadlines_affected ?? 0,
    remindersDismissed: data.reminders_dismissed ?? 0,
    notesUnlinked: data.notes_unlinked ?? 0,
    todoItemsAffected: data.todo_items_affected ?? 0,
    suggestionsDismissed: data.suggestions_dismissed ?? 0,
  };
}

export interface TaskDeleteCascadeResult {
  notesUnlinked: number;
  suggestionsDismissed: number;
}

export interface TodoListDeleteCascadeResult {
  itemsAffected: number;
}

/**
 * Soft-deletes a To-Do list and, atomically, its live items (see
 * supabase/migrations/0015_course_todos.sql's soft_delete_todo_list_cascade).
 */
export async function cascadeDeleteTodoList(
  supabase: SupabaseClient<Database>,
  listId: string,
): Promise<TodoListDeleteCascadeResult> {
  const { data, error } = await supabase.rpc("soft_delete_todo_list_cascade", { p_list_id: listId }).single();
  if (error) throw error;

  return { itemsAffected: data.items_affected ?? 0 };
}

export interface PersonDeleteCascadeResult {
  coursesAffected: number;
  deadlinesAffected: number;
  tasksAffected: number;
  remindersDismissed: number;
  notesUnlinked: number;
}

/**
 * SPEC-API-004 AC-7/AC-13, NC-API-008: soft-deletes a Task and, atomically,
 * clears linked_task_id on any Note referencing it. The task's own Reminder
 * dismissal is handled by the DB trigger as part of the same UPDATE and
 * needs no separate step here.
 */
export async function cascadeDeleteTask(
  supabase: SupabaseClient<Database>,
  taskId: string,
): Promise<TaskDeleteCascadeResult> {
  const { data, error } = await supabase.rpc("soft_delete_task_cascade", { p_task_id: taskId }).single();
  if (error) throw error;

  return { notesUnlinked: data.notes_unlinked ?? 0, suggestionsDismissed: data.suggestions_dismissed ?? 0 };
}

/**
 * Soft-deletes a Person and, atomically, cascades to soft-delete their live
 * Courses/Deadlines/Tasks (dismissing Reminders) and clears linked_course_id/
 * linked_task_id on any Note referencing those (see
 * supabase/migrations/0013_people.sql's soft_delete_person_cascade).
 */
export async function cascadeDeletePerson(
  supabase: SupabaseClient<Database>,
  personId: string,
): Promise<PersonDeleteCascadeResult> {
  const { data, error } = await supabase.rpc("soft_delete_person_cascade", { p_person_id: personId }).single();
  if (error) throw error;

  return {
    coursesAffected: data.courses_affected ?? 0,
    deadlinesAffected: data.deadlines_affected ?? 0,
    tasksAffected: data.tasks_affected ?? 0,
    remindersDismissed: data.reminders_dismissed ?? 0,
    notesUnlinked: data.notes_unlinked ?? 0,
  };
}
