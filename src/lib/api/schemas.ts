import { z } from "zod";
import { KNOWLEDGE_MAX_PASTED_TEXT_CHARS, KNOWLEDGE_MAX_TITLE_CHARS } from "@/lib/knowledge/constants";
import { MAX_SPEAK_TEXT_CHARS } from "@/lib/voice/constants";

// Shared payload shapes from SPEC-API-004's shared_schemas. `xPatchSchema` is
// the same shape with every field optional — used by the id-addressed PATCH
// routes, which must never accept a `status` field (NC-API-002: state fields
// only change through the explicit transition action route).

// A structured replacement for the old free-text meeting_pattern column:
// which days a block meets (0=Sun..6=Sat, matches Date.getDay()) and its
// start/end time window in minutes-since-midnight. Structured data can't
// fail to parse the way the old regex grammar could.
const meetingBlockSchema = z
  .object({
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Duplicate day in a single block"),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(0).max(1439),
  })
  .refine((block) => block.endMinutes > block.startMinutes, {
    message: "End time must be after start time",
    path: ["endMinutes"],
  });

const RECURRENCE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Shared across Deadlines, Tasks, and Course To-Do items
// (supabase/migrations/0021_item_priority.sql's item_priority enum).
// nullable (not just optional): a client must be able to explicitly clear a
// previously-set priority back to unset via `null` over JSON, which a plain
// .optional() enum can't express (undefined can't be sent over the wire).
const itemPrioritySchema = z.enum(["Low", "Medium", "High", "Urgent"]).nullable().optional();

// person_id: nullable/optional on Courses and Tasks -- null/omitted means
// "the account owner's own item", a non-null value must reference a People
// row the caller owns (verified by the route, and backstopped by the
// guard_course_person_ownership/guard_task_person_ownership DB triggers in
// supabase/migrations/0013_people.sql). Deadlines deliberately have no
// person_id field here: a deadline's owner is always inherited from its
// (required) course, never client-set -- see POST /api/deadlines.
//
// meeting_blocks/recurrence_start_date/recurrence_end_date replace the old
// free-text meeting_pattern (supabase/migrations/0014_course_recurrence.sql).
// Timezone is deliberately not a course field — it's read from the caller's
// user_preferences.timezone at render time instead.
//
// Base object kept separate from its .refine() below (same reason
// userPreferencesPatchSchema applies .partial() before .superRefine()):
// .refine() returns a ZodEffects, which has no .partial() method, so the
// PATCH schema must branch off the plain object, not the refined payload one.
// (A generic `withRecurrenceDateOrderCheck<T>(schema)` helper was tried here
// but breaks zodResolver's type inference — react-hook-form needs each
// schema's concrete literal type, not one erased through a generic
// ZodType<T> parameter — so the refine is duplicated inline on each instead.)
const courseBaseSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  term: z.string().trim().min(1).optional(),
  meeting_blocks: z.array(meetingBlockSchema).max(10).optional(),
  recurrence_start_date: z.string().regex(RECURRENCE_DATE_REGEX, "Expected YYYY-MM-DD").nullable().optional(),
  recurrence_end_date: z.string().regex(RECURRENCE_DATE_REGEX, "Expected YYYY-MM-DD").nullable().optional(),
  location: z.string().trim().min(1).optional(),
  instructor: z.string().trim().min(1).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_lead_minutes: z.number().int().nonnegative().optional(),
  person_id: z.uuid().nullable().optional(),
});

const RECURRENCE_DATE_ORDER_CHECK = {
  message: "recurrence_start_date must be on or before recurrence_end_date",
  path: ["recurrence_end_date"],
};

export const coursePayloadSchema = courseBaseSchema.refine(
  (value) => !value.recurrence_start_date || !value.recurrence_end_date || value.recurrence_start_date <= value.recurrence_end_date,
  RECURRENCE_DATE_ORDER_CHECK,
);
export type CoursePayload = z.infer<typeof coursePayloadSchema>;
export const coursePatchSchema = courseBaseSchema.partial().refine(
  (value) => !value.recurrence_start_date || !value.recurrence_end_date || value.recurrence_start_date <= value.recurrence_end_date,
  RECURRENCE_DATE_ORDER_CHECK,
);
export type CoursePatch = z.infer<typeof coursePatchSchema>;

export const deadlinePayloadSchema = z.object({
  course_id: z.uuid(),
  title: z.string().trim().min(1),
  due_at: z.iso.datetime({ offset: true }),
  priority: itemPrioritySchema,
});
export type DeadlinePayload = z.infer<typeof deadlinePayloadSchema>;
export const deadlinePatchSchema = deadlinePayloadSchema.omit({ course_id: true }).partial();
export type DeadlinePatch = z.infer<typeof deadlinePatchSchema>;

// Course To-Do board: a lightweight per-course/custom-list checklist,
// distinct from Tasks (no course link) and Deadlines (status enum, priority,
// reminders). course_id null means a freestanding custom list ("Misc",
// "Project: X") — see supabase/migrations/0015_course_todos.sql.
export const todoListPayloadSchema = z.object({
  course_id: z.uuid().nullable().optional(),
  name: z.string().trim().min(1),
});
export type TodoListPayload = z.infer<typeof todoListPayloadSchema>;
export const todoListPatchSchema = todoListPayloadSchema.partial();
export type TodoListPatch = z.infer<typeof todoListPatchSchema>;

export const todoItemPayloadSchema = z.object({
  list_id: z.uuid(),
  title: z.string().trim().min(1),
  due_date: z.iso.date().nullable().optional(),
  priority: itemPrioritySchema,
});
export type TodoItemPayload = z.infer<typeof todoItemPayloadSchema>;
export const todoItemPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  due_date: z.iso.date().nullable().optional(),
  is_done: z.boolean().optional(),
  priority: itemPrioritySchema,
});
export type TodoItemPatch = z.infer<typeof todoItemPatchSchema>;

export const appointmentPayloadSchema = z.object({
  title: z.string().trim().min(1),
  date: z.iso.date(),
  category: z.string().trim().min(1).optional(),
  time: z.string().trim().min(1).nullable().optional(),
  location: z.string().trim().min(1).nullable().optional(),
  notes: z.array(z.string()).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_lead_minutes: z.number().int().nonnegative().optional(),
});
export type AppointmentPayload = z.infer<typeof appointmentPayloadSchema>;
export const appointmentPatchSchema = appointmentPayloadSchema.partial();
export type AppointmentPatch = z.infer<typeof appointmentPatchSchema>;

export const taskPayloadSchema = z.object({
  title: z.string().trim().min(1),
  due_at: z.iso.datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_lead_minutes: z.number().int().nonnegative().optional(),
  person_id: z.uuid().nullable().optional(),
  priority: itemPrioritySchema,
});
export type TaskPayload = z.infer<typeof taskPayloadSchema>;
export const taskPatchSchema = taskPayloadSchema.partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

// SPEC-CALENDAR-001-ish People: a Person tracked under the account owner's
// own account (e.g. a family member whose schedule they maintain for
// coordination) -- not a real second app user. color must be #RRGGBB,
// matching the DB CHECK constraint on people.color.
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const personPayloadSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().regex(HEX_COLOR_REGEX, "Expected #RRGGBB hex color").optional(),
  // Free-text relationship to the account owner (e.g. "sister", "roommate")
  // -- max length mirrors the DB check constraint in 0024_people_relationship.sql.
  // Empty-string submits (an untouched form field) normalize to null here so
  // PersonForm.tsx needs no extra logic beyond registering the input.
  relationship: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type PersonPayload = z.infer<typeof personPayloadSchema>;
export const personPatchSchema = personPayloadSchema.partial();
export type PersonPatch = z.infer<typeof personPatchSchema>;

export const reminderAckSchema = z.object({
  event: z.enum(["user_acknowledges", "user_dismisses", "user_snoozes"]),
  // Must be future-dated: a past value would have the very next dispatch
  // tick re-deliver immediately, making the Snoozed state a no-op.
  snooze_until: z.iso
    .datetime({ offset: true })
    .refine((value) => new Date(value).getTime() > Date.now(), "snooze_until must be in the future")
    .optional(),
});
export type ReminderAckPayload = z.infer<typeof reminderAckSchema>;

export const notePayloadSchema = z.object({
  body: z.string().trim().min(1),
  linked_course_id: z.uuid().nullable().optional(),
  linked_task_id: z.uuid().nullable().optional(),
  linked_date: z.iso.date().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});
export type NotePayload = z.infer<typeof notePayloadSchema>;
export const notePatchSchema = notePayloadSchema.partial();
export type NotePatch = z.infer<typeof notePatchSchema>;

// SPEC-API-007 FeedbackPayload. No patch schema: v1 feedback is
// submit-once, delete-if-unwanted (no PATCH route, no update RLS policy).
export const feedbackPayloadSchema = z.object({
  target_type: z.enum(["deadline", "task", "reminder"]),
  target_id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).optional(),
});
export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;

// SPEC-API-008 KnowledgeSourcePayload. Validates the non-file fields parsed
// out of the create route's multipart FormData; file presence/absence and
// its own validation (magic bytes, size) is handled separately by
// src/lib/knowledge/upload-guard.ts, since a File isn't representable in a
// plain zod object the same way a JSON field is. No patch schema: v1 is
// delete-and-reimport only, no edit route (SPEC-CORE-008 out_of_scope).
export const knowledgeSourceCreateFieldsSchema = z
  .object({
    source_type: z.enum(["url", "pasted_text", "image", "video", "audio"]),
    // Security-review finding: neither field had an upper bound, so a
    // pasted-text/title field could be arbitrarily large within whatever
    // ceiling Next's formData() parsing itself enforces — KNOWLEDGE_MAX_*
    // caps (src/lib/knowledge/constants.ts) bound the worst case explicitly
    // rather than leaving it to an unrelated framework default.
    title: z.string().trim().min(1).max(KNOWLEDGE_MAX_TITLE_CHARS),
    url: z.string().trim().min(1).optional(),
    text: z.string().trim().min(1).max(KNOWLEDGE_MAX_PASTED_TEXT_CHARS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source_type === "url" && !value.url) {
      ctx.addIssue({ code: "custom", message: "url is required when source_type is \"url\"", path: ["url"] });
    }
    if (value.source_type === "pasted_text" && !value.text) {
      ctx.addIssue({ code: "custom", message: "text is required when source_type is \"pasted_text\"", path: ["text"] });
    }
  });
export type KnowledgeSourceCreateFields = z.infer<typeof knowledgeSourceCreateFieldsSchema>;

// SPEC-API-009 UserPreferencesResponse. A singleton-per-caller resource (no
// id-addressed route) — PATCH validates a partial payload and the route
// upserts by user_id. quiet_hours_start/quiet_hours_end must be provided
// together (NC-API-USERPREFS-001): the DB CHECK constraint
// (0010_user_preferences.sql) is the real backstop, but rejecting a
// half-set pair here gives the caller a specific 400 instead of a generic
// constraint-violation 500.
const QUIET_HOURS_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// NC-API-USERPREFS-005: reject an unresolvable IANA zone name before it
// reaches the database — Intl.DateTimeFormat throws RangeError for one.
function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const userPreferencesPatchSchema = z
  .object({
    default_reminder_lead_minutes: z.number().int().min(0).max(1440),
    quiet_hours_start: z.string().regex(QUIET_HOURS_TIME_REGEX, "Expected HH:MM (24-hour)").nullable(),
    quiet_hours_end: z.string().regex(QUIET_HOURS_TIME_REGEX, "Expected HH:MM (24-hour)").nullable(),
    timezone: z.string().refine(isValidTimeZone, "Not a recognized IANA time zone name"),
    voice_capture_enabled: z.boolean(),
    email_reminders_enabled: z.boolean(),
    hands_free_voice_enabled: z.boolean(),
    speak_suggestions_aloud: z.boolean(),
  })
  .partial()
  .superRefine((value, ctx) => {
    const touchesStart = "quiet_hours_start" in value;
    const touchesEnd = "quiet_hours_end" in value;
    if (touchesStart !== touchesEnd) {
      ctx.addIssue({
        code: "custom",
        message: "quiet_hours_start and quiet_hours_end must be provided together",
        path: [touchesStart ? "quiet_hours_end" : "quiet_hours_start"],
      });
      return;
    }
    if (touchesStart && (value.quiet_hours_start === null) !== (value.quiet_hours_end === null)) {
      ctx.addIssue({
        code: "custom",
        message: "quiet_hours_start and quiet_hours_end must both be set or both be null",
        path: ["quiet_hours_end"],
      });
    }
  });
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>;

// SPEC-API-010 NC-API-SPEAK-002: validated before synthesizeSpeech() (a
// paid ElevenLabs/OpenAI call) is ever invoked.
export const voiceSpeakSchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEAK_TEXT_CHARS),
  // When true, POST /api/voice/speak returns a raw streaming audio/mpeg
  // Response instead of the standard JSON envelope — see route.ts.
  stream: z.boolean().optional(),
});
export type VoiceSpeakPayload = z.infer<typeof voiceSpeakSchema>;
