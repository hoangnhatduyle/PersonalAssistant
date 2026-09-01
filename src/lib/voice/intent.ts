import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import { requireEnv } from "@/lib/env";
import type { PendingMutation } from "@/lib/voice/mutations";

export interface ResolvedIntent {
  confidence: number;
  readOnly: boolean;
  /** Short human-readable description of the resolved action, spoken/shown back to the user. */
  summary: string;
  queryKind?: "upcoming_schedule" | "knowledge_lookup" | "personalization_suggestions" | "general_conversation";
  mutation?: PendingMutation;
}

export interface ResolveIntentFn {
  (supabase: SupabaseClient<Database>, userId: string, transcript: string): Promise<ResolvedIntent>;
}

const mutationSchemaBase = z.discriminatedUnion("target_type", [
  z.object({ target_type: z.literal("course"), operation: z.literal("delete"), target_id: z.uuid() }),
  z.object({
    target_type: z.literal("deadline"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    course_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    priority: z.string().nullable(),
  }),
  z.object({
    target_type: z.literal("task"),
    operation: z.enum(["create", "update", "delete"]),
    target_id: z.uuid().nullable(),
    title: z.string().nullable(),
    due_at: z.iso.datetime({ offset: true }).nullable(),
    // null = no reminder-timing phrase present in the request (e.g. plain
    // "add a task to buy milk" with no "remind me" wording). 0 = an explicit
    // "remind me AT <time>" phrasing, meaning the reminder should fire
    // exactly at due_at rather than some minutes before it.
    reminder_lead_minutes: z.number().int().min(0).max(1440).nullable(),
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
]);

// Review finding (code/typescript/security reviewers, independently):
// target_id and the per-entity fields were nullable regardless of
// `operation`, relying on toPendingMutation's `!` non-null assertions
// (compile-time only) to keep a null value out of a PendingMutation.
// Enforce every such invariant in the schema itself instead, so a
// schema-violating LLM response fails validation cleanly rather than
// producing a runtime `null` typed as `string`.
export const mutationSchema = mutationSchemaBase.superRefine((value, ctx) => {
  if (value.target_type === "course") return;

  if (value.target_type === "reminder") {
    if (value.event === "user_snoozes" && !value.snooze_until) {
      ctx.addIssue({ code: "custom", message: "snooze_until is required for user_snoozes", path: ["snooze_until"] });
    }
    return;
  }

  if (value.operation !== "create" && value.target_id === null) {
    ctx.addIssue({ code: "custom", message: `target_id is required when operation is "${value.operation}"`, path: ["target_id"] });
    return;
  }

  if (value.operation === "create") {
    if (value.target_type === "deadline" && (!value.course_id || !value.title || !value.due_at)) {
      ctx.addIssue({ code: "custom", message: "course_id, title, and due_at are required to create a deadline", path: ["title"] });
    }
    if (value.target_type === "task" && !value.title) {
      ctx.addIssue({ code: "custom", message: "title is required to create a task", path: ["title"] });
    }
    if (value.target_type === "note" && !value.body) {
      ctx.addIssue({ code: "custom", message: "body is required to create a note", path: ["body"] });
    }
  }
});

export type RawMutation = z.infer<typeof mutationSchema>;

// Review finding: a schema-violating LLM response of { read_only: false,
// mutation: null } (or the reverse) previously passed validation, then
// crashed session.ts's unguarded `intent.mutation as PendingMutation` cast.
export const llmResponseSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    read_only: z.boolean(),
    summary: z.string(),
    query_kind: z.enum(["upcoming_schedule", "knowledge_lookup", "personalization_suggestions", "general_conversation"]).nullable(),
    mutation: mutationSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.read_only && value.mutation !== null) {
      ctx.addIssue({ code: "custom", message: "mutation must be null when read_only is true", path: ["mutation"] });
    }
    if (!value.read_only && value.mutation === null) {
      ctx.addIssue({ code: "custom", message: "mutation is required when read_only is false", path: ["mutation"] });
    }
  });

const SYSTEM_PROMPT = `You are the intent-resolution layer for a student personal-assistant app.
Given a spoken/transcribed user request, the current server time, the user's
IANA time zone, and a JSON list of that user's current Courses, Deadlines,
and Tasks (with their ids), resolve it to exactly one supported operation
and respond with ONLY a JSON object matching this shape:

{
  "confidence": number,        // 0-1, your genuine confidence this is the right resolution
  "read_only": boolean,
  "summary": string,           // one sentence describing the action, for the user
  "query_kind": "upcoming_schedule" | "knowledge_lookup" | "personalization_suggestions" | "general_conversation" | null,   // set when read_only
  "mutation": {                // set when !read_only, else null
    "target_type": "course" | "deadline" | "task" | "note" | "reminder",
    "operation": "create" | "update" | "delete" | "acknowledge",
    "target_id": string | null,   // an id from the provided context list; null only for "create"
    ... other fields for the target type (title, due_at, body, event,
    reminder_lead_minutes, etc.), null if not mentioned
  } | null
}

Supported operations: create/update/delete a Deadline, Task, or Note;
delete a Course; acknowledge/dismiss/snooze a Reminder; query the upcoming
schedule (read-only); look up information from the user's personal knowledge
base of imported reference material (read-only, query_kind
"knowledge_lookup"); check for app-generated reminder-timing personalization
suggestions based on the user's feedback history (read-only, query_kind
"personalization_suggestions"); or answer an open-ended conversational
question (read-only, query_kind "general_conversation"). Nothing else is
supported.

Choose among the read-only query kinds using these boundaries:
- "knowledge_lookup": the user explicitly asks about material they imported,
  saved, uploaded, captured, or previously provided, such as "what did that
  article say about research paths?" or "summarize the notes I saved."
- "personalization_suggestions": the user explicitly asks to check the app's
  generated personalization/reminder-timing suggestions, such as "check my
  suggestions" or "did the app recommend changing my reminder timing?"
- "upcoming_schedule": the user only wants a factual listing of their upcoming
  Tasks or Deadlines, such as "what is due this week?"
- "general_conversation": open-ended advice, opinions, trade-off analysis,
  scheduling guidance, wellbeing questions, or other conversation that does
  not require imported reference material, such as "should I attend this
  meeting or rest?", "what do you think about my schedule?", or "help me weigh
  these two options." Use this even when the request mentions the user's own
  Tasks, Deadlines, or Courses, unless the user is asking only for a factual
  schedule listing or requesting a supported mutation.

A mutation requires a clear instruction to change app data, such as "create",
"add", "update", "delete", "cancel this task", or "remind me to". Do not infer
a mutation merely because the user mentions a possible real-world action.
Questions, hypotheticals, and requests for advice take precedence and must be
"general_conversation", even when they contain action verbs. In particular,
"should I...", "do you think I should...", "what are your thoughts/advice...",
"would it be better to...", and conditional phrases such as "in case I..."
are not commands. If a request asks for advice and discusses a task the user
might create, choose "general_conversation" unless it also contains a separate,
explicit instruction to create that task.

The request's "now" field is the current server timestamp (UTC, ISO 8601)
and "timezone" is the user's IANA time zone — use both as the anchor for any
relative date/time phrase ("tomorrow", "next Friday", "in an hour", "5pm").
Resolve a time-of-day phrase like "5pm" to 5pm in the user's own timezone,
then convert it to an ISO datetime string with that timezone's correct UTC
offset for that instant — never assume UTC or guess at today's date.

A "remind me to X" phrase with no reference to an existing Course, Deadline,
or Task is a request to create a new Task, not a Reminder operation
directly — Reminders are always derived automatically from a Task's or
Deadline's due_at, never created directly (the only supported Reminder
operation is "acknowledge", against an id from the provided context list).
Set target_type "task", operation "create", and title to the request
stripped of the leading "remind me [to]" phrasing (e.g. "remind me to
submit my assignment" -> title "Submit my assignment"). Use
reminder_lead_minutes to capture reminder-timing phrasing on a task
create/update: an explicit "remind me AT <time>" (fire exactly at due_at)
sets it to 0; "remind me N minutes/hours before" sets it to that many
minutes; no reminder-timing phrasing at all leaves it null (the task's own
default lead time applies).

Examples:
- "Remind me to submit my assignment tomorrow at 5pm" -> task create, title
  "Submit my assignment", due_at resolved from "tomorrow at 5pm" using now/
  timezone, reminder_lead_minutes: 0.
- "Remind me 30 minutes before my dentist task" (referencing an existing
  task) -> task update, target_id from context, reminder_lead_minutes: 30.
- "Remind me to review notes before Friday" (no exact time) -> task create,
  title "Review notes", due_at resolved to end-of-day Friday in the user's
  timezone, reminder_lead_minutes: null.
- "Do I have any suggestions?" / "Check for recommendations" -> read_only
  true, query_kind "personalization_suggestions", mutation null.
- "Should I reach out to IEEE for information in case I miss the meeting?"
  -> read_only true, query_kind "general_conversation", mutation null. This is
  asking whether to act, not instructing the app to create a Task.
- "I am tired and the timing is tight. What do you think, and should I ask
  IEEE for notes?" -> read_only true, query_kind "general_conversation",
  mutation null.
- "Create a task to ask IEEE for notes" -> read_only false, mutation is a Task
  create.

If the request doesn't map confidently to one of these, or names an entity
not in the provided context list, set confidence below 0.95 rather than
guessing at a target_id. Never invent an id.`;

interface EntityContext {
  courses: Array<{ id: string; name: string }>;
  deadlines: Array<{ id: string; title: string; course_id: string }>;
  tasks: Array<{ id: string; title: string }>;
}

async function loadEntityContext(supabase: SupabaseClient<Database>, userId: string): Promise<EntityContext> {
  const [{ data: courses }, { data: deadlines }, { data: tasks }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("user_id", userId).is("deleted_at", null),
    supabase.from("deadlines").select("id, title, course_id").eq("user_id", userId).is("deleted_at", null),
    supabase.from("tasks").select("id, title").eq("user_id", userId).is("deleted_at", null),
  ]);
  return { courses: courses ?? [], deadlines: deadlines ?? [], tasks: tasks ?? [] };
}

/**
 * The anchor resolveIntent needs so relative date/time phrases ("tomorrow
 * at 5pm") resolve against the user's actual timezone rather than the
 * model's own guess. Falls back to "UTC" (matches
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
    case "course":
      return { targetType: "course", operation: "delete", targetId: raw.target_id };
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
          },
        };
      }
      if (raw.operation === "delete") {
        return { targetType: "task", operation: "delete", targetId: raw.target_id! };
      }
      return {
        targetType: "task",
        operation: "update",
        targetId: raw.target_id!,
        payload: {
          ...(raw.title ? { title: raw.title } : {}),
          ...(raw.due_at !== null ? { due_at: raw.due_at } : {}),
          ...(raw.reminder_lead_minutes !== null ? { reminder_lead_minutes: raw.reminder_lead_minutes } : {}),
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
  }
}

/**
 * Resolves a transcript to a ResolvedIntent using an LLM classifier
 * (SPEC-VOICE-005's "LLM for intent parsing/NLU", vendor decision open).
 * Entity ids are only ever id's the caller's own live rows already had — the
 * model is given a context list and told never to invent one; toPendingMutation
 * simply forwards whatever the model chose, so a hallucinated id fails at
 * execution time (not-found/RLS) rather than silently targeting a real row.
 */
export async function resolveIntent(
  supabase: SupabaseClient<Database>,
  userId: string,
  transcript: string,
): Promise<ResolvedIntent> {
  const [context, timezone] = await Promise.all([loadEntityContext(supabase, userId), loadUserTimezone(supabase, userId)]);
  const now = new Date().toISOString();
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ transcript, now, timezone, context }) },
    ],
  });

  const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}");
  const parsed = llmResponseSchema.parse(raw);

  return {
    confidence: parsed.confidence,
    readOnly: parsed.read_only,
    summary: parsed.summary,
    queryKind: parsed.query_kind ?? undefined,
    mutation: parsed.mutation ? toPendingMutation(parsed.mutation) : undefined,
  };
}
