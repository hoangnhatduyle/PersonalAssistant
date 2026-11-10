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
  // Estimate + hand-set progress (0063): Deadline/Task carry all three; a Session update carries its
  // estimate (duration_minutes) and progress only.
  ...(["deadline", "task"] as const).flatMap((target_type) =>
    (["create", "update"] as const).flatMap((operation) =>
      (["estimated_hours", "progress_percent", "progress_note"] as const).map((field) => ({ target_type, operation, field })),
    ),
  ),
  { target_type: "session", operation: "update", field: "duration_minutes" },
  { target_type: "session", operation: "update", field: "progress_percent" },
  { target_type: "session", operation: "update", field: "progress_note" },
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
  // A session is an appointments row, so its update is the appointment patch.
  session: { update: appointmentPatchSchema },
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

// triage_item_id is advertised on propose_mutation but is not a payload field:
// it rides on the PendingMutation itself (src/lib/voice/mutations.ts's
// triageItemId) so confirmVoiceSession can mark the originating email handled.
// It is therefore checked here rather than in the ADVERTISED payload table.
describe("triage_item_id conformance", () => {
  const TRIAGE_ID = "33333333-3333-4333-8333-333333333333";

  it("is advertised on propose_mutation", () => {
    expect(MUTATION_FIELD_NAMES).toContain("triage_item_id");
  });

  it.each(["deadline", "task", "event"])("survives onto a %s create's PendingMutation, outside the API payload", (targetType) => {
    const raw = mutationSchema.safeParse({ ...sampleArgs(targetType, "create", "title"), triage_item_id: TRIAGE_ID });
    expect(raw.success).toBe(true);
    if (!raw.success) return;
    const pending = toPendingMutation(raw.data, NOW, TIMEZONE);
    expect(pending).toMatchObject({ targetType, operation: "create", triageItemId: TRIAGE_ID });
    if ("payload" in pending) expect(pending.payload).not.toHaveProperty("triage_item_id");
  });

  it("defaults to null and is omitted when the model leaves it out", () => {
    const raw = mutationSchema.safeParse(sampleArgs("task", "create", "title"));
    expect(raw.success).toBe(true);
    if (!raw.success) return;
    expect(toPendingMutation(raw.data, NOW, TIMEZONE)).not.toHaveProperty("triageItemId");
  });

  it("rejects a value that isn't a uuid", () => {
    expect(mutationSchema.safeParse({ ...sampleArgs("task", "create", "title"), triage_item_id: "not-a-uuid" }).success).toBe(false);
  });
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
    estimated_hours: 4.5,
    progress_percent: 60,
    progress_note: "outline done",
    event: null,
    snooze_until: null,
    deadline_id: null,
  };
  if (field === "course_id" && targetType === "todo_list") base.course_id = COURSE_ID;
  return base;
}

describe("estimate and progress edge cases", () => {
  const parse = (args: Record<string, unknown>) => mutationSchema.safeParse(args);
  const pending = (args: Record<string, unknown>) => {
    const raw = parse(args);
    if (!raw.success) throw new Error(raw.error.message);
    return toPendingMutation(raw.data, NOW, TIMEZONE);
  };

  it("keeps a deliberate 0 percent (it is a real answer, not 'unset')", () => {
    const result = pending({ ...sampleArgs("task", "update", "title"), progress_percent: 0 });
    expect(result).toMatchObject({ payload: { progress_percent: 0 } });
  });

  it("omits the fields entirely when the user did not say them", () => {
    const result = pending({ ...sampleArgs("deadline", "update", "title"), estimated_hours: null, progress_percent: null, progress_note: null });
    if (!("payload" in result)) throw new Error("expected a payload");
    expect(result.payload).not.toHaveProperty("estimated_hours");
    expect(result.payload).not.toHaveProperty("progress_percent");
    expect(result.payload).not.toHaveProperty("progress_note");
  });

  it("tolerates the model leaving the keys out altogether", () => {
    const args = { ...sampleArgs("task", "update", "title") } as Record<string, unknown>;
    delete args.estimated_hours;
    delete args.progress_percent;
    delete args.progress_note;
    expect(parse(args).success).toBe(true);
  });

  it.each([
    ["progress_percent", 101],
    ["progress_percent", -1],
    ["progress_percent", 33.5],
    ["estimated_hours", 0],
    ["estimated_hours", -2],
    ["estimated_hours", 10_000],
  ])("rejects an out-of-range %s of %s", (field, value) => {
    expect(parse({ ...sampleArgs("deadline", "update", "title"), [field]: value }).success).toBe(false);
  });

  it("drops a blank progress note rather than saving an empty one", () => {
    const result = pending({ ...sampleArgs("task", "update", "title"), progress_note: "   " });
    if (!("payload" in result)) throw new Error("expected a payload");
    expect(result.payload).not.toHaveProperty("progress_note");
  });

  it("a session update carries only the estimate and progress, never title, date or time", () => {
    const result = pending({
      ...sampleArgs("session", "update", "progress_percent"),
      title: "Renamed",
      date: "2026-07-01",
      time: "9:00 AM",
    });
    expect(result).toMatchObject({ targetType: "session", operation: "update", targetId: ID });
    if (!("payload" in result)) throw new Error("expected a payload");
    expect(Object.keys(result.payload).sort()).toEqual(["duration_minutes", "progress_note", "progress_percent"]);
  });

  it("a session update needs a target id", () => {
    expect(parse({ ...sampleArgs("session", "update", "progress_percent"), target_id: null }).success).toBe(false);
  });

  it("an estimate is advertised on propose_mutation for deadlines and tasks, not sessions", () => {
    expect(MUTATION_FIELD_NAMES).toContain("estimated_hours");
    const session = pending({ ...sampleArgs("session", "update", "progress_percent"), estimated_hours: 3 });
    if (!("payload" in session)) throw new Error("expected a payload");
    expect(session.payload).not.toHaveProperty("estimated_hours");
  });
});
