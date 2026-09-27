import { requireAuthenticatedContext } from "@/lib/api/auth";
import { successResponse, serverErrorResponse } from "@/lib/api/response";

export interface TaskActivityEntry {
  taskId: string;
  lastActivityAt: string;
}

/**
 * GET /api/tasks/activity — per-task last-touched timestamp aggregated
 * across a task's checklist items, attachments, and linked notes. Powers
 * StaleItemsCard's neglect signal (src/lib/dashboard/stale-items.ts):
 * checking off a checklist item or adding a note is real in-app progress on
 * a task, but none of those tables' updated_at columns roll up into the
 * parent tasks row on their own (each has its own independent
 * set_updated_at trigger, no cascade to the parent).
 */
export async function GET() {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;

  const [checklistItems, attachments, notes] = await Promise.all([
    supabase.from("checklist_items").select("task_id, updated_at").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("task_attachments").select("task_id, updated_at").eq("user_id", user.id).is("deleted_at", null),
    // notes has no updated_at column (edits aren't tracked distinctly from
    // creation) -- created_at is the only timestamp available.
    supabase
      .from("notes")
      .select("linked_task_id, created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .not("linked_task_id", "is", null),
  ]);

  if (checklistItems.error) return serverErrorResponse("checklist activity lookup failed", checklistItems.error);
  if (attachments.error) return serverErrorResponse("attachment activity lookup failed", attachments.error);
  if (notes.error) return serverErrorResponse("note activity lookup failed", notes.error);

  const lastActivityByTaskId = new Map<string, string>();
  const consider = (taskId: string | null, updatedAt: string) => {
    if (!taskId) return;
    const current = lastActivityByTaskId.get(taskId);
    if (!current || updatedAt > current) lastActivityByTaskId.set(taskId, updatedAt);
  };
  for (const row of checklistItems.data ?? []) consider(row.task_id, row.updated_at);
  for (const row of attachments.data ?? []) consider(row.task_id, row.updated_at);
  for (const row of notes.data ?? []) consider(row.linked_task_id, row.created_at);

  const entries: TaskActivityEntry[] = Array.from(lastActivityByTaskId, ([taskId, lastActivityAt]) => ({
    taskId,
    lastActivityAt,
  }));
  return successResponse(entries);
}
