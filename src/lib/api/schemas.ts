import { z } from "zod";
import { KNOWLEDGE_MAX_PASTED_TEXT_CHARS, KNOWLEDGE_MAX_TITLE_CHARS } from "@/lib/knowledge/constants";

// Shared payload shapes from SPEC-API-004's shared_schemas. `xPatchSchema` is
// the same shape with every field optional — used by the id-addressed PATCH
// routes, which must never accept a `status` field (NC-API-002: state fields
// only change through the explicit transition action route).

export const coursePayloadSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  term: z.string().trim().min(1).optional(),
  meeting_pattern: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  instructor: z.string().trim().min(1).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_lead_minutes: z.number().int().nonnegative().optional(),
});
export type CoursePayload = z.infer<typeof coursePayloadSchema>;
export const coursePatchSchema = coursePayloadSchema.partial();
export type CoursePatch = z.infer<typeof coursePatchSchema>;

export const deadlinePayloadSchema = z.object({
  course_id: z.uuid(),
  title: z.string().trim().min(1),
  due_at: z.iso.datetime({ offset: true }),
  priority: z.string().trim().min(1).optional(),
});
export type DeadlinePayload = z.infer<typeof deadlinePayloadSchema>;
export const deadlinePatchSchema = deadlinePayloadSchema.omit({ course_id: true }).partial();
export type DeadlinePatch = z.infer<typeof deadlinePatchSchema>;

export const taskPayloadSchema = z.object({
  title: z.string().trim().min(1),
  due_at: z.iso.datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_lead_minutes: z.number().int().nonnegative().optional(),
});
export type TaskPayload = z.infer<typeof taskPayloadSchema>;
export const taskPatchSchema = taskPayloadSchema.partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

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
