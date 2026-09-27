import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  appointmentPatchSchema,
  appointmentPayloadSchema,
  coursePatchSchema,
  coursePayloadSchema,
  deadlinePatchSchema,
  deadlinePayloadSchema,
  notePatchSchema,
  notePayloadSchema,
  taskPatchSchema,
  taskPayloadSchema,
  todoListPatchSchema,
  todoListPayloadSchema,
} from "@/lib/api/schemas";
import { MUTATION_FIELD_NAMES } from "@/lib/voice/tools";
import { mutationSchema, toPendingMutation } from "@/lib/voice/intent";

/**
 * Fields the tool schema advertises for a given target_type + operation.
 * Each row must either survive into the pending mutation / matching API
 * payload-or-patch schema, or be listed in CREATE_ONLY / UNSUPPORTED so a
 * silent drop cannot be reintroduced.
 */
const ADVERTISED: Array<{ target_type: string; operation: string; field: string }> = [
  { target_type: "deadline", operation: "create", field: "course_id" },
  { target_type: "deadline", operation: "create", field: "title" },
  { target_type: "deadline", operation: "create", field: "due_at" },
  { target_type: "deadline", operation: "create", field: "priority" },
  { target_type: "deadline", operation: "update", field: "course_id" },
  { target_type: "deadline", operation: "update", field: "title" },
  { target_type: "deadline", operation: "update", field: "due_at" },
  { target_type: "deadline", operation: "update", field: "priority" },
  { target_type: "task", operation: "create", field: "title" },
  { target_type: "task", operation: "create", field: "due_at" },
  { target_type: "task", operation: "create", field: "priority" },
  { target_type: "task", operation: "create", field: "list_id" },
  { target_type: "task", operation: "create", field: "reminder_lead_minutes" },
  { target_type: "task", operation: "update", field: "title" },
  { target_type: "task", operation: "update", field: "list_id" },
  { target_type: "note", operation: "create", field: "body" },
  { target_type: "note", operation: "update", field: "body" },
  { target_type: "course", operation: "create", field: "name" },
  { target_type: "course", operation: "create", field: "code" },
  { target_type: "course", operation: "update", field: "name" },
  { target_type: "todo_list", operation: "create", field: "name" },
  { target_type: "todo_list", operation: "create", field: "course_id" },
  { target_type: "event", operation: "create", field: "title" },
  { target_type: "event", operation: "create", field: "date" },
  { target_type: "event", operation: "create", field: "time" },
  { target_type: "event", operation: "create", field: "duration_minutes" },
  { target_type: "event", operation: "create", field: "location" },
  { target_type: "event", operation: "update", field: "title" },
  { target_type: "event", operation: "update", field: "location" },
];

const CREATE_ONLY = new Set(["deadline.create.course_id"]);
const UNSUPPORTED = new Set(["deadline.update.course_id"]);

const NOW = new Date("2026-06-15T12:00:00.000Z");
const TIMEZONE = "UTC";
const ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const API_SCHEMAS: Record<string, { create?: z.ZodType; update?: z.ZodType }> = {
  deadline: { create: deadlinePayloadSchema, update: deadlinePatchSchema },
  task: { create: taskPayloadSchema, update: taskPatchSchema },
  note: { create: notePayloadSchema, update: notePatchSchema },
  course: { create: coursePayloadSchema, update: coursePatchSchema },
  todo_list: { create: todoListPayloadSchema, update: todoListPatchSchema },
  event: { create: appointmentPayloadSchema, update: appointmentPatchSchema },
};

function objectShape(schema: z.ZodType | undefined): Record<string, unknown> | undefined {
  let current: unknown = schema;
  while (current && typeof current === "object") {
    const record = current as { shape?: Record<string, unknown>; _def?: { schema?: unknown; innerType?: unknown } };
    if (record.shape && typeof record.shape === "object") return record.shape;
    current = record._def?.schema ?? record._def?.innerType;
  }
  return undefined;
}

function schemaHasField(schema: z.ZodType | undefined, field: string): boolean {
  return Boolean(objectShape(schema)?.[field] !== undefined);
}

describe("mutation field conformance", () => {
  it("still advertises every field the conformance table talks about", () => {
    for (const { field } of ADVERTISED) {
      expect(MUTATION_FIELD_NAMES).toContain(field);
    }
  });

  it.each(ADVERTISED.map((row) => ({ ...row, name: `${row.target_type}.${row.operation}.${row.field}` })))(
    "$name is accounted for",
    ({ target_type, operation, field }) => {
    const key = `${target_type}.${operation}.${field}`;
    const api = API_SCHEMAS[target_type]?.[operation as "create" | "update"];
    const onApi = schemaHasField(api, field);

    if (UNSUPPORTED.has(key)) {
      expect(onApi).toBe(false);
      const parsed = mutationSchema.safeParse({
        target_type,
        operation,
        target_id: ID,
        course_id: COURSE_ID,
        title: "x",
        due_at: null,
        priority: null,
      });
      expect(parsed.success).toBe(false);
      return;
    }

    expect(onApi).toBe(true);

    if (CREATE_ONLY.has(key)) {
      expect(operation).toBe("create");
    }

    const raw = mutationSchema.safeParse(sampleArgs(target_type, operation, field));
    expect(raw.success).toBe(true);
    if (!raw.success) return;
    const pending = toPendingMutation(raw.data, NOW, TIMEZONE);
    if (pending.operation === "create" || pending.operation === "update") {
      expect(pending).toHaveProperty("payload");
      if ("payload" in pending) {
        expect(pending.payload).toHaveProperty(field);
      }
    }
    },
  );
});

function sampleArgs(targetType: string, operation: string, field: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    target_type: targetType,
    operation,
    target_id: operation === "create" ? null : ID,
    course_id: targetType === "deadline" && operation === "create" ? COURSE_ID : null,
    title: "Sample",
    due_at: "2026-06-16T12:00:00.000Z",
    body: "A note",
    priority: "High",
    reminder_lead_minutes: 30,
    name: "Sample",
    code: "CS 101",
    term: "Fall 2026",
    list_id: ID,
    date: "2026-06-16",
    time: "3:00 PM",
    duration_minutes: 60,
    location: "Room 1",
    event: null,
    snooze_until: null,
    deadline_id: null,
  };
  if (field === "course_id" && targetType === "todo_list") base.course_id = COURSE_ID;
  return base;
}
