import { describe, expect, it } from "vitest";
import { loadEntityContext, loadUserTimezone, mutationSchema, toPendingMutation } from "../intent";
import { adminClient, createAuthenticatedUser, createCourse, createDeadline, createPerson, createTask } from "../../../../supabase/tests/helpers";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
const VALID_COURSE_ID = "22222222-2222-4222-8222-222222222222";

describe("mutationSchema", () => {
  it("accepts a valid create (no target_id required)", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects update/delete with a null target_id (review finding: target_id was nullable regardless of operation)", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "update",
      target_id: null,
      course_id: null,
      title: "New title",
      due_at: null,
      priority: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a deadline create missing a required field", () => {
    const missingTitle = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: null,
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(missingTitle.success).toBe(false);
  });

  it("rejects a task create with no title", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a note create with no body", () => {
    const result = mutationSchema.safeParse({ target_type: "note", operation: "create", target_id: null, body: null });
    expect(result.success).toBe(false);
  });

  it("requires snooze_until when event is user_snoozes", () => {
    const missing = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: null,
    });
    expect(missing.success).toBe(false);

    const present = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: "2026-09-01T00:00:00.000Z",
    });
    expect(present.success).toBe(true);
  });

  it("does not require snooze_until for user_acknowledges/user_dismisses", () => {
    const result = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_acknowledges",
      snooze_until: null,
    });
    expect(result.success).toBe(true);
  });

  it("a course delete always requires a non-null target_id (schema-level, not just the shared refine)", () => {
    const result = mutationSchema.safeParse({ target_type: "course", operation: "delete", target_id: null });
    expect(result.success).toBe(false);
  });

  it("accepts a task create with reminder_lead_minutes: 0 (explicit \"remind me at <time>\")", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Submit assignment",
      due_at: "2026-09-01T17:00:00.000Z",
      reminder_lead_minutes: 0,
      priority: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a task create with reminder_lead_minutes: null (no reminder-timing phrase present)", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy milk",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a task's reminder_lead_minutes outside the 0-1440 bound", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Submit assignment",
      due_at: "2026-09-01T17:00:00.000Z",
      reminder_lead_minutes: 1500,
      priority: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a task create with an explicit priority", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Call the bank",
      due_at: null,
      reminder_lead_minutes: null,
      priority: "High",
    });
    expect(result.success).toBe(true);
  });

  // gpt-4o-mini's JSON mode isn't fully reliable about including every
  // declared key -- verified live that it sometimes omits `priority`
  // entirely rather than emitting null when none was mentioned. Confirms
  // the omission defaults to null rather than failing validation.
  it("defaults an omitted priority key to null instead of rejecting the response", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy textbooks",
      due_at: "2026-09-01T17:00:00.000Z",
      reminder_lead_minutes: 0,
      // priority intentionally omitted
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.target_type === "task") expect(result.data.priority).toBeNull();
  });
});

describe("toPendingMutation", () => {
  it("maps a course delete", () => {
    const raw = mutationSchema.parse({ target_type: "course", operation: "delete", target_id: VALID_TARGET_ID });
    expect(toPendingMutation(raw)).toEqual({ targetType: "course", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a deadline create, dropping null-valued optional fields", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "deadline",
      operation: "create",
      payload: { course_id: VALID_COURSE_ID, title: "Essay draft", due_at: "2026-09-01T00:00:00.000Z", priority: undefined },
    });
  });

  it("maps a task update, including only the fields actually provided", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "update",
      target_id: VALID_TARGET_ID,
      title: "Renamed",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "task",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { title: "Renamed" },
    });
  });

  it("maps a task update with an explicit priority", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "update",
      target_id: VALID_TARGET_ID,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: "Urgent",
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "task",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { priority: "Urgent" },
    });
  });

  it("maps a note delete", () => {
    const raw = mutationSchema.parse({ target_type: "note", operation: "delete", target_id: VALID_TARGET_ID, body: null });
    expect(toPendingMutation(raw)).toEqual({ targetType: "note", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a task create with an explicit reminder_lead_minutes: 0", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Submit assignment",
      due_at: "2026-09-01T17:00:00.000Z",
      reminder_lead_minutes: 0,
      priority: null,
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Submit assignment", due_at: "2026-09-01T17:00:00.000Z", reminder_lead_minutes: 0, priority: undefined },
    });
  });

  it("maps a task create with reminder_lead_minutes: null by omitting the key entirely", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy milk",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    const mutation = toPendingMutation(raw);
    expect(mutation).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Buy milk", due_at: null, priority: undefined },
    });
    expect(mutation).not.toHaveProperty("payload.reminder_lead_minutes");
  });

  it("maps a task create with an explicit priority", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Call the bank",
      due_at: null,
      reminder_lead_minutes: null,
      priority: "High",
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Call the bank", due_at: null, priority: "High" },
    });
  });

  it("maps a reminder acknowledge with a snooze", () => {
    const raw = mutationSchema.parse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: "2026-09-01T00:00:00.000Z",
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "reminder",
      operation: "acknowledge",
      targetId: VALID_TARGET_ID,
      event: "user_snoozes",
      snoozeUntil: "2026-09-01T00:00:00.000Z",
    });
  });
});

describe("loadUserTimezone", () => {
  // Minimal fake of the .from().select().eq().maybeSingle() chain
  // resolveIntent's timezone lookup uses — not a real SupabaseClient.
  function fakeSupabase(maybeSingleResult: { data: { timezone: string } | null }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => maybeSingleResult,
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("returns the stored timezone when a user_preferences row exists", async () => {
    const timezone = await loadUserTimezone(fakeSupabase({ data: { timezone: "America/Chicago" } }), "user-1");
    expect(timezone).toBe("America/Chicago");
  });

  it("falls back to UTC when no user_preferences row exists", async () => {
    const timezone = await loadUserTimezone(fakeSupabase({ data: null }), "user-1");
    expect(timezone).toBe("UTC");
  });
});

describe("loadEntityContext", () => {
  const admin = adminClient();

  // Regression: a tracked Person's (0013_people.sql) courses/deadlines/tasks
  // are stored under the account owner's own user_id via a nullable
  // person_id column -- a bare .eq("user_id", ...) filter alone previously
  // let another tracked person's items appear in the entity context handed
  // to the model for propose_mutation id-matching (and, since the 2h merge,
  // every conversational turn's prompt).
  it("excludes a tracked Person's courses/deadlines/tasks, keeping only the account owner's own", async () => {
    const { userId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, userId, { name: "Sister" });

    const myCourseId = await createCourse(admin, userId, { name: "My own course" });
    await createDeadline(admin, userId, myCourseId, { title: "My own deadline" });
    await createTask(admin, userId, { title: "My own task" });

    const herCourseId = await createCourse(admin, userId, { name: "Sister's course", person_id: personId });
    await createDeadline(admin, userId, herCourseId, { title: "Sister's deadline", person_id: personId });
    await createTask(admin, userId, { title: "Sister's task", person_id: personId });

    const context = await loadEntityContext(client, userId);

    expect(context.courses.map((c) => c.name)).toEqual(["My own course"]);
    expect(context.deadlines.map((d) => d.title)).toEqual(["My own deadline"]);
    expect(context.tasks.map((t) => t.title)).toEqual(["My own task"]);
  });

  // Regression for the relationship-aware get_person_schedule feature: the
  // model needs each tracked Person's id/name/relationship to resolve "my
  // sister's schedule" to a specific person_id -- a soft-deleted person must
  // never appear (same 0013_people.sql pattern as the other soft-deletable
  // entities already excluded elsewhere via .is("deleted_at", null)).
  it("includes each tracked Person's id/name/relationship, excluding a soft-deleted person", async () => {
    const { userId, client } = await createAuthenticatedUser();
    const sisterId = await createPerson(admin, userId, { name: "Châu", relationship: "sister" });
    const roommateId = await createPerson(admin, userId, { name: "Alex" });
    await createPerson(admin, userId, { name: "Old Roommate", deleted_at: new Date().toISOString() });

    const context = await loadEntityContext(client, userId);

    expect(context.people).toEqual(
      expect.arrayContaining([
        { id: sisterId, name: "Châu", relationship: "sister" },
        { id: roommateId, name: "Alex", relationship: null },
      ]),
    );
    expect(context.people).toHaveLength(2);
  });
});
