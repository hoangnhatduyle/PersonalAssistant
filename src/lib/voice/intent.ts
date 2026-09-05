import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import type { PendingMutation } from "@/lib/voice/mutations";

// Shared across the deadline/task mutation variants below — mirrors
// supabase/migrations/0021_item_priority.sql's item_priority enum. A bare
// z.string() previously let the LLM emit any free text, which could fail
// the DB insert/update once the column became a strict enum.
//
// .default(null): gpt-4o-mini's JSON mode is not fully reliable about
// including every declared key when it has nothing to report for it —
// verified directly (a live "remind me to buy textbooks tomorrow at 5pm"
// call, no priority mentioned) that it sometimes omits `priority` entirely
// rather than emitting `null`, which a bare `.nullable()` (required key)
// rejects outright. Tolerate the omission as equivalent to null; an
// explicitly-provided invalid value is still rejected.
const itemPriorityMutationSchema = z.enum(["Low", "Medium", "High", "Urgent"]).nullable().default(null);

// Deadline/Task/Session status fields only ever change through one of these
// explicit transition events (NC-API-002, mirrors src/lib/api/transitions.ts
// exactly) — never an arbitrary status value. `.default(null)` for the same
// omission-tolerance reason as itemPriorityMutationSchema above: only
// required (superRefine, below) when operation is actually "transition".
const deadlineTransitionEventSchema = z
  .enum(["user_marks_in_progress", "user_marks_submitted", "user_confirms_done", "user_cancels"])
  .nullable()
  .default(null);
const taskTransitionEventSchema = z.enum(["user_marks_done", "user_cancels"]).nullable().default(null);
const sessionTransitionEventSchema = z.enum(["user_marks_session_done", "user_marks_session_skipped"]).nullable().default(null);

const mutationSchemaBase = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("course"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    name: z.string().nullable().default(null),
    code: z.string().nullable().default(null),
    term: z.string().nullable().default(null),
  }),
  z.object({
    target_type: z.literal("deadline"),
    operation: z.enum(["create", "update", "delete", "transition"]),
    target_id: z.uuid().nullable(),
    course_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    priority: itemPriorityMutationSchema,
    event: deadlineTransitionEventSchema,
  }),
  z.object({
    target_type: z.literal("task"),
    operation: z.enum(["create", "update", "delete", "transition"]),
    target_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    // null = no reminder-timing phrase present in the request (e.g. plain
    // "add a task to buy milk" with no "remind me" wording). 0 = an explicit
    // "remind me AT <time>" phrasing, meaning the reminder should fire
    // exactly at due_at rather than some minutes before it.
    reminder_lead_minutes: z.number().int().min(0).max(1440).nullable(),
    priority: itemPriorityMutationSchema,
    event: taskTransitionEventSchema,
  }),
  z.object({
    target_type: z.literal("note"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    body: z.string().nullable(),
  }),
  z.object({
    target_type: z.literal("reminder"),
    operation: z.literal("acknowledge"),
    target_id: z.uuid(),
    event: z.enum(["user_acknowledges", "user_dismisses", "user_snoozes"]),
    snooze_until: z.iso.datetime({ offset: true }).nullable(),
  }),
  // Deadline Sessions (appointments rows tagged category "Session"). No
  // "update" operation — the UI itself has no edit action for an existing
  // session, only create/delete/mark done/mark skipped (SessionsSection.tsx).
  z.object({
    target_type: z.literal("session"),
    operation: z.enum(["create", "delete", "transition"]),
    target_id: z.uuid().nullable(),
    deadline_id: z.uuid().nullable(),
    title: z.string().nullable(),
    date: z.iso.date().nullable(),
    time: z.string().nullable(),
    duration_minutes: z.number().int().positive().nullable(),
    event: sessionTransitionEventSchema,
  }),
  // Course To-Do list. Create only — the UI has no rename/delete action for
  // a list, only for the items inside it (CourseTodoBoardContainer.tsx).
  z.object({
    target_type: z.literal("todo_list"),
    operation: z.literal("create"),
    course_id: z.uuid().nullable(),
    name: z.string().nullable(),
  }),
  z.object({
    target_type: z.literal("todo_item"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    list_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_date: z.iso.date().nullable(),
    priority: itemPriorityMutationSchema,
    // Toggles is_done on update ("mark complete" / "mark incomplete") — a
    // plain boolean rather than a transition event, since todo_items have no
    // state machine (see todoItemPatchSchema in schemas.ts).
    done: z.boolean().nullable().default(null),
  }),
]);

function requireTargetIdUnlessCreate(
  value: { operation: string; target_id: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.operation !== "create" && !value.target_id) {
    ctx.addIssue({ code: "custom", message: `target_id is required when operation is "${value.operation}"`, path: ["target_id"] });
  }
}

// Review finding (code/typescript/security reviewers, independently):
// target_id and the per-entity fields were nullable regardless of
// `operation`, relying on toPendingMutation's `!` non-null assertions
// (compile-time only) to keep a null value out of a PendingMutation.
// Enforce every such invariant in the schema itself instead, so a
// schema-violating LLM response fails validation cleanly rather than
// producing a runtime `null` typed as `string`.
export const mutationSchema = mutationSchemaBase.superRefine((value, ctx) => {
  switch (value.target_type) {
    case "course": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && !value.name) {
        ctx.addIssue({ code: "custom", message: "name is required to create a course", path: ["name"] });
      }
      return;
    }
    case "deadline": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && (!value.course_id || !value.title || !value.due_at)) {
        ctx.addIssue({ code: "custom", message: "course_id, title, and due_at are required to create a deadline", path: ["title"] });
      }
      if (value.operation === "transition" && !value.event) {
        ctx.addIssue({ code: "custom", message: "event is required for a transition operation", path: ["event"] });
      }
      return;
    }
    case "task": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && !value.title) {
        ctx.addIssue({ code: "custom", message: "title is required to create a task", path: ["title"] });
      }
      if (value.operation === "transition" && !value.event) {
        ctx.addIssue({ code: "custom", message: "event is required for a transition operation", path: ["event"] });
      }
      return;
    }
    case "note": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && !value.body) {
        ctx.addIssue({ code: "custom", message: "body is required to create a note", path: ["body"] });
      }
      return;
    }
    case "reminder": {
      if (value.event === "user_snoozes" && !value.snooze_until) {
        ctx.addIssue({ code: "custom", message: "snooze_until is required for user_snoozes", path: ["snooze_until"] });
      }
      return;
    }
    case "session": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && (!value.deadline_id || !value.title || !value.date)) {
        ctx.addIssue({ code: "custom", message: "deadline_id, title, and date are required to create a session", path: ["title"] });
      }
      if (value.operation === "transition" && !value.event) {
        ctx.addIssue({ code: "custom", message: "event is required for a transition operation", path: ["event"] });
      }
      return;
    }
    case "todo_list": {
      if (!value.name) {
        ctx.addIssue({ code: "custom", message: "name is required to create a to-do list", path: ["name"] });
      }
      return;
    }
    case "todo_item": {
      requireTargetIdUnlessCreate(value, ctx);
      if (value.operation === "create" && (!value.list_id || !value.title)) {
        ctx.addIssue({ code: "custom", message: "list_id and title are required to create a to-do item", path: ["title"] });
      }
      return;
    }
  }
});

export type RawMutation = z.infer<typeof mutationSchema>;

export interface EntityContext {
  courses: Array<{ id: string; name: string }>;
  deadlines: Array<{ id: string; title: string; course_id: string }>;
  tasks: Array<{ id: string; title: string }>;
  // Course To-Do lists/items (0015_course_todos.sql) -- for resolving a
  // todo_item create's list_id, or an existing item's/list's id by title,
  // the same "id from the entity context, never invented" pattern as
  // deadlines/tasks above.
  todoLists: Array<{ id: string; name: string; course_id: string | null }>;
  todoItems: Array<{ id: string; title: string; list_id: string }>;
  // Deadline Sessions (0025_deadline_sessions.sql) -- appointments rows
  // tagged category "Session", for resolving an existing session's id to
  // delete/mark done/mark skipped.
  sessions: Array<{ id: string; title: string; deadline_id: string | null }>;
  // Bug fix: without this, mutation-vs-read-only classification had zero
  // visibility into what the user's knowledge base actually contains, so a
  // request naming a saved source by its own title/topic (e.g. "test the
  // bucket list" against a source titled "My Girlfriend (Tien) Bucket
  // List") had no anchor to recognize it as a read-only lookup — it fell
  // back to treating the bare imperative as an instruction to create a
  // task literally titled that. Titles only (no content) — same shape/cost
  // as the courses/deadlines/tasks lists above, just enough for the model
  // to match a reference.
  knowledgeSources: Array<{ id: string; title: string }>;
  // Tracked People (0013_people.sql) the model may resolve "my sister"/
  // "Châu" against for get_person_schedule's person_id arg -- id + name +
  // relationship only, never any of that person's own items (those stay
  // excluded from courses/deadlines/tasks above by the person_id IS NULL
  // filter, unchanged).
  people: Array<{ id: string; name: string; relationship: string | null }>;
}

export async function loadEntityContext(supabase: SupabaseClient<Database>, userId: string): Promise<EntityContext> {
  // person_id IS NULL excludes rows tagged to a tracked Person (0013_people.sql
  // -- e.g. a family member's courses/tasks/deadlines an account owner tracks
  // under their own user_id). Without this, a mutation (or, since the 2h
  // merge, any conversational turn) could reference or target another
  // tracked person's item by id — mirrors the same filter in
  // src/lib/voice/schedule-loader.ts's loadSchedule and
  // src/app/api/intelligence/route.ts. todo_lists/todo_items and
  // appointments have no person_id column at all (Course To-Do items and
  // Deadline Sessions are owner-only concepts — see schedule-loader.ts's
  // own includeOwnerOnlyData comment), so those three queries need no such
  // filter.
  const [
    { data: courses },
    { data: deadlines },
    { data: tasks },
    { data: todoLists },
    { data: todoItems },
    { data: sessions },
    { data: knowledgeSources },
    { data: people },
  ] = await Promise.all([
    supabase.from("courses").select("id, name").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("deadlines").select("id, title, course_id").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("tasks").select("id, title").eq("user_id", userId).is("person_id", null).is("deleted_at", null),
    supabase.from("todo_lists").select("id, name, course_id").eq("user_id", userId).is("deleted_at", null),
    supabase.from("todo_items").select("id, title, list_id").eq("user_id", userId).is("deleted_at", null),
    supabase.from("appointments").select("id, title, deadline_id").eq("user_id", userId).eq("category", "Session").is("deleted_at", null),
    supabase.from("knowledge_sources").select("id, title").eq("user_id", userId).eq("status", "Ready"),
    supabase.from("people").select("id, name, relationship").eq("user_id", userId).is("deleted_at", null),
  ]);
  return {
    courses: courses ?? [],
    deadlines: deadlines ?? [],
    tasks: tasks ?? [],
    todoLists: todoLists ?? [],
    todoItems: todoItems ?? [],
    sessions: sessions ?? [],
    knowledgeSources: knowledgeSources ?? [],
    people: people ?? [],
  };
}

/**
 * The anchor the conversational core needs so relative date/time phrases
 * ("tomorrow at 5pm") resolve against the user's actual timezone rather
 * than the model's own guess. Falls back to "UTC" (matches
 * DEFAULT_USER_PREFERENCES.timezone) when the user has never saved a
 * preferences row.
 */
export async function loadUserTimezone(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone ?? "UTC";
}

/**
 * mutationSchema's superRefine above guarantees every field this function
 * asserts non-null on (`!`) is actually present for the given operation —
 * these are no longer bare compile-time-only assertions papering over a
 * runtime gap; a schema-violating response never reaches this function.
 */
export function toPendingMutation(raw: RawMutation): PendingMutation {
  switch (raw.target_type) {
    case "course": {
      if (raw.operation === "delete") {
        return { targetType: "course", operation: "delete", targetId: raw.target_id! };
      }
      if (raw.operation === "create") {
        return {
          targetType: "course",
          operation: "create",
          payload: { name: raw.name!, ...(raw.code ? { code: raw.code } : {}), ...(raw.term ? { term: raw.term } : {}) },
        };
      }
      return {
        targetType: "course",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.name ? { name: raw.name } : {}),
          ...(raw.code ? { code: raw.code } : {}),
          ...(raw.term ? { term: raw.term } : {}),
        },
      };
    }
    case "deadline": {
      if (raw.operation === "create") {
        return {
          targetType: "deadline",
          operation: "create",
          payload: { course_id: raw.course_id!, title: raw.title!, due_at: raw.due_at!, priority: raw.priority ?? undefined },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "deadline", operation: "delete", targetId: raw.target_id! };
      }
      if (raw.operation === "transition") {
        return { targetType: "deadline", operation: "transition", targetId: raw.target_id!, event: raw.event! };
      }
      return {
        targetType: "deadline",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_at ? { due_at: raw.due_at } : {}),
          ...(raw.priority ? { priority: raw.priority } : {}),
        },
      };
    }
    case "task": {
      if (raw.operation === "create") {
        return {
          targetType: "task",
          operation: "create",
          payload: {
            title: raw.title!,
            due_at: raw.due_at,
            ...(raw.reminder_lead_minutes !== null ? { reminder_lead_minutes: raw.reminder_lead_minutes } : {}),
            priority: raw.priority ?? undefined,
          },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "task", operation: "delete", targetId: raw.target_id! };
      }
      if (raw.operation === "transition") {
        return { targetType: "task", operation: "transition", targetId: raw.target_id!, event: raw.event! };
      }
      return {
        targetType: "task",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_at !== null ? { due_at: raw.due_at } : {}),
          ...(raw.reminder_lead_minutes !== null ? { reminder_lead_minutes: raw.reminder_lead_minutes } : {}),
          ...(raw.priority ? { priority: raw.priority } : {}),
        },
      };
    }
    case "note": {
      if (raw.operation === "create") {
        return { targetType: "note", operation: "create", payload: { body: raw.body! } };
      }
      if (raw.operation === "delete") {
        return { targetType: "note", operation: "delete", targetId: raw.target_id! };
      }
      return { targetType: "note", operation: "update", targetId: raw.target_id!, payload: { ...(raw.body ? { body: raw.body } : {}) } };
    }
    case "reminder":
      return {
        targetType: "reminder",
        operation: "acknowledge",
        targetId: raw.target_id,
        event: raw.event,
        snoozeUntil: raw.snooze_until ?? undefined,
      };
    case "session": {
      if (raw.operation === "create") {
        return {
          targetType: "session",
          operation: "create",
          payload: {
            deadline_id: raw.deadline_id!,
            title: raw.title!,
            date: raw.date!,
            ...(raw.time ? { time: raw.time } : {}),
            ...(raw.duration_minutes !== null ? { duration_minutes: raw.duration_minutes } : {}),
          },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "session", operation: "delete", targetId: raw.target_id! };
      }
      return { targetType: "session", operation: "transition", targetId: raw.target_id!, event: raw.event! };
    }
    case "todo_list":
      return {
        targetType: "todo_list",
        operation: "create",
        payload: { name: raw.name!, ...(raw.course_id ? { course_id: raw.course_id } : {}) },
      };
    case "todo_item": {
      if (raw.operation === "create") {
        return {
          targetType: "todo_item",
          operation: "create",
          payload: {
            list_id: raw.list_id!,
            title: raw.title!,
            ...(raw.due_date ? { due_date: raw.due_date } : {}),
            priority: raw.priority ?? undefined,
          },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "todo_item", operation: "delete", targetId: raw.target_id! };
      }
      return {
        targetType: "todo_item",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_date ? { due_date: raw.due_date } : {}),
          ...(raw.priority ? { priority: raw.priority } : {}),
          ...(raw.done !== null ? { is_done: raw.done } : {}),
        },
      };
    }
  }
}
