import { describe, expect, it } from "vitest";
import { loadEntityContext, loadUserTimezone, mutationSchema, toPendingMutation } from "../intent";
import { adminClient, createAuthenticatedUser, createCourse, createDeadline, createPerson, createTask } from "../../../../supabase/tests/helpers";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
const VALID_COURSE_ID = "22222222-2222-4222-8222-222222222222";
// Fixed clock/timezone for toPendingMutation's due_at-default tests -- UTC
// keeps "end of today" arithmetic trivial to assert against.
const NOW = new Date("2026-06-15T12:00:00.000Z");
const TIMEZONE = "UTC";
const END_OF_TODAY_UTC = "2026-06-15T23:59:59.999Z";

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

  it("accepts a deadline create with no due_at -- toPendingMutation defaults it, so the schema itself must not require it", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: null,
      priority: null,
    });
    expect(result.success).toBe(true);
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

  it("accepts a course create with just a name", () => {
    const result = mutationSchema.safeParse({ target_type: "course", operation: "create", target_id: null, name: "CS 101" });
    expect(result.success).toBe(true);
  });

  it("rejects a course create with no name", () => {
    const result = mutationSchema.safeParse({ target_type: "course", operation: "create", target_id: null, name: null });
    expect(result.success).toBe(false);
  });

  it("rejects a deadline transition with no event", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      course_id: null,
      title: null,
      due_at: null,
      priority: null,
      event: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a deadline transition with a valid event", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      course_id: null,
      title: null,
      due_at: null,
      priority: null,
      event: "user_marks_submitted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a task transition with no event", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      event: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a session create with deadline_id, title, and date", () => {
    const result = mutationSchema.safeParse({
      target_type: "session",
      operation: "create",
      target_id: null,
      deadline_id: VALID_TARGET_ID,
      title: "Read chapter 3",
      date: "2026-09-06",
      time: null,
      duration_minutes: null,
      event: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a session create missing deadline_id", () => {
    const result = mutationSchema.safeParse({
      target_type: "session",
      operation: "create",
      target_id: null,
      deadline_id: null,
      title: "Read chapter 3",
      date: "2026-09-06",
      time: null,
      duration_minutes: null,
      event: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a session transition with no event", () => {
    const result = mutationSchema.safeParse({
      target_type: "session",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      deadline_id: null,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      event: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an event create with title, date, time, and duration_minutes all present", () => {
    const result = mutationSchema.safeParse({
      target_type: "event",
      operation: "create",
      target_id: null,
      title: "Dentist visit",
      date: "2026-09-06",
      time: "3:00 PM",
      duration_minutes: 30,
      location: null,
      event: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an event create missing time or duration_minutes (unlike a session, an event always needs both)", () => {
    const missingTime = mutationSchema.safeParse({
      target_type: "event",
      operation: "create",
      target_id: null,
      title: "Dentist visit",
      date: "2026-09-06",
      time: null,
      duration_minutes: 30,
      location: null,
      event: null,
    });
    expect(missingTime.success).toBe(false);

    const missingDuration = mutationSchema.safeParse({
      target_type: "event",
      operation: "create",
      target_id: null,
      title: "Dentist visit",
      date: "2026-09-06",
      time: "3:00 PM",
      duration_minutes: null,
      location: null,
      event: null,
    });
    expect(missingDuration.success).toBe(false);
  });

  it("rejects an event transition with no event", () => {
    const result = mutationSchema.safeParse({
      target_type: "event",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      location: null,
      event: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an event transition with a valid event", () => {
    const result = mutationSchema.safeParse({
      target_type: "event",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      location: null,
      event: "user_marks_event_missed",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a to-do list create with just a name", () => {
    const result = mutationSchema.safeParse({ target_type: "todo_list", operation: "create", target_id: null, course_id: null, name: "Misc" });
    expect(result.success).toBe(true);
  });

  it("rejects a to-do list create with no name", () => {
    const result = mutationSchema.safeParse({ target_type: "todo_list", operation: "create", target_id: null, course_id: null, name: null });
    expect(result.success).toBe(false);
  });

  it("rejects a to-do list update/delete with a null target_id", () => {
    const result = mutationSchema.safeParse({ target_type: "todo_list", operation: "delete", target_id: null, course_id: null, name: null });
    expect(result.success).toBe(false);
  });

  it("accepts a to-do list rename (update)", () => {
    const result = mutationSchema.safeParse({
      target_type: "todo_list",
      operation: "update",
      target_id: VALID_TARGET_ID,
      course_id: null,
      name: "New name",
    });
    expect(result.success).toBe(true);
  });

  // Board merge (supabase/migrations/0029_board_merge.sql): a "Course To-Do
  // item" is now just a Task with list_id set.
  it("accepts a task create with a list_id (Board List placement)", () => {
    const result = mutationSchema.safeParse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Read chapter 3",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      list_id: VALID_TARGET_ID,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a task create with no list_id (Unsorted)", () => {
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
    if (result.success && result.data.target_type === "task") expect(result.data.list_id).toBeNull();
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({ targetType: "course", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a deadline create, defaulting a null priority to Medium", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "create",
      payload: { course_id: VALID_COURSE_ID, title: "Essay draft", due_at: "2026-09-01T00:00:00.000Z", priority: "Medium" },
    });
  });

  it("maps a deadline create with no due_at, defaulting to end-of-today in the user's timezone", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: null,
      priority: "High",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "create",
      payload: { course_id: VALID_COURSE_ID, title: "Essay draft", due_at: END_OF_TODAY_UTC, priority: "High" },
    });
  });

  it("maps a recurring deadline create, sorting/deduping days and carrying the end date", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Weekly quiz",
      due_at: "2026-09-02T22:00:00.000Z",
      priority: null,
      recurring: true,
      recurrence_days: [3, 1, 3],
      recurrence_end_date: "2026-12-11",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "create",
      payload: {
        course_id: VALID_COURSE_ID,
        title: "Weekly quiz",
        due_at: "2026-09-02T22:00:00.000Z",
        priority: "Medium",
        recurrence_days: [1, 3],
        recurrence_end_date: "2026-12-11",
      },
    });
  });

  it("a recurring deadline create with no due_at defaults to the end of its first selected day", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Weekly quiz",
      due_at: null,
      priority: null,
      recurring: true,
      recurrence_days: [5],
    });
    const mapped = toPendingMutation(raw, NOW, TIMEZONE);
    if (mapped.targetType !== "deadline" || mapped.operation !== "create") throw new Error("unexpected mapping");
    // Whatever day that resolves to, it must be a Friday in the user's timezone, not today's end-of-day.
    const dueParts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(new Date(mapped.payload.due_at));
    expect(dueParts).toBe("Fri");
    expect(mapped.payload.recurrence_days).toEqual([5]);
  });

  it("treats recurring null/false as one-off on create (no recurrence fields in the payload)", () => {
    for (const recurring of [null, false]) {
      const raw = mutationSchema.parse({
        target_type: "deadline",
        operation: "create",
        target_id: null,
        course_id: VALID_COURSE_ID,
        title: "Essay",
        due_at: "2026-09-01T00:00:00.000Z",
        priority: null,
        recurring,
        recurrence_days: [1],
      });
      const mapped = toPendingMutation(raw, NOW, TIMEZONE);
      expect(mapped).toMatchObject({ targetType: "deadline", operation: "create" });
      expect((mapped as { payload: object }).payload).not.toHaveProperty("recurrence_days");
    }
  });

  it("clears the repeat rule on a deadline update with recurring false, sets it with true, leaves it alone with null", () => {
    const base = { target_type: "deadline", operation: "update", target_id: VALID_TARGET_ID, course_id: null, title: null, due_at: null, priority: null };
    expect(toPendingMutation(mutationSchema.parse({ ...base, recurring: false }), NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { recurrence_days: [], recurrence_end_date: null },
    });
    expect(toPendingMutation(mutationSchema.parse({ ...base, recurring: true, recurrence_days: [2] }), NOW, TIMEZONE)).toMatchObject({
      payload: { recurrence_days: [2], recurrence_end_date: null },
    });
    expect(toPendingMutation(mutationSchema.parse({ ...base }), NOW, TIMEZONE)).toMatchObject({ payload: {} });
  });

  it("rejects recurring true with no days", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay",
      due_at: null,
      priority: null,
      recurring: true,
      recurrence_days: [],
    });
    expect(result.success).toBe(false);
  });

  it("carries a cancel scope on a deadline cancel, and omits it otherwise", () => {
    const base = { target_type: "deadline", operation: "transition", target_id: VALID_TARGET_ID, course_id: null, title: null, due_at: null, priority: null };
    expect(toPendingMutation(mutationSchema.parse({ ...base, event: "user_cancels", cancel_scope: "series" }), NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "transition",
      targetId: VALID_TARGET_ID,
      event: "user_cancels",
      cancelScope: "series",
    });
    expect(toPendingMutation(mutationSchema.parse({ ...base, event: "user_cancels" }), NOW, TIMEZONE)).not.toHaveProperty("cancelScope");
    // A scope on any other event is ignored.
    expect(toPendingMutation(mutationSchema.parse({ ...base, event: "user_marks_in_progress", cancel_scope: "series" }), NOW, TIMEZONE)).not.toHaveProperty("cancelScope");
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "task",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { priority: "Urgent" },
    });
  });

  it("maps a note delete", () => {
    const raw = mutationSchema.parse({ target_type: "note", operation: "delete", target_id: VALID_TARGET_ID, body: null });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({ targetType: "note", operation: "delete", targetId: VALID_TARGET_ID });
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Submit assignment", due_at: "2026-09-01T17:00:00.000Z", reminder_lead_minutes: 0, priority: "Medium" },
    });
  });

  it("maps a task create with reminder_lead_minutes: null by omitting the key entirely, defaulting priority to Medium but leaving due_at null (unlike a Deadline)", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy milk",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    const mutation = toPendingMutation(raw, NOW, TIMEZONE);
    expect(mutation).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Buy milk", due_at: null, priority: "Medium" },
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
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
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "reminder",
      operation: "acknowledge",
      targetId: VALID_TARGET_ID,
      event: "user_snoozes",
      snoozeUntil: "2026-09-01T00:00:00.000Z",
    });
  });

  it("maps a course create, dropping omitted optional fields", () => {
    const raw = mutationSchema.parse({ target_type: "course", operation: "create", target_id: null, name: "CS 101" });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({ targetType: "course", operation: "create", payload: { name: "CS 101" } });
  });

  it("maps a deadline transition", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      course_id: null,
      title: null,
      due_at: null,
      priority: null,
      event: "user_marks_submitted",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "deadline",
      operation: "transition",
      targetId: VALID_TARGET_ID,
      event: "user_marks_submitted",
    });
  });

  it("maps a task transition", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      event: "user_marks_done",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "task",
      operation: "transition",
      targetId: VALID_TARGET_ID,
      event: "user_marks_done",
    });
  });

  it("maps a session create, dropping omitted optional fields", () => {
    const raw = mutationSchema.parse({
      target_type: "session",
      operation: "create",
      target_id: null,
      deadline_id: VALID_COURSE_ID,
      title: "Read chapter 3",
      date: "2026-09-06",
      time: null,
      duration_minutes: null,
      event: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "session",
      operation: "create",
      payload: { deadline_id: VALID_COURSE_ID, title: "Read chapter 3", date: "2026-09-06" },
    });
  });

  it("maps a session transition", () => {
    const raw = mutationSchema.parse({
      target_type: "session",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      deadline_id: null,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      event: "user_marks_session_done",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "session",
      operation: "transition",
      targetId: VALID_TARGET_ID,
      event: "user_marks_session_done",
    });
  });

  it("maps an event create, dropping an omitted location", () => {
    const raw = mutationSchema.parse({
      target_type: "event",
      operation: "create",
      target_id: null,
      title: "Dentist visit",
      date: "2026-09-06",
      time: "3:00 PM",
      duration_minutes: 30,
      location: null,
      event: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "event",
      operation: "create",
      payload: { title: "Dentist visit", date: "2026-09-06", time: "3:00 PM", duration_minutes: 30 },
    });
  });

  it("maps an event create with a location", () => {
    const raw = mutationSchema.parse({
      target_type: "event",
      operation: "create",
      target_id: null,
      title: "Dentist visit",
      date: "2026-09-06",
      time: "3:00 PM",
      duration_minutes: 30,
      location: "Downtown clinic",
      event: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "event",
      operation: "create",
      payload: { title: "Dentist visit", date: "2026-09-06", time: "3:00 PM", duration_minutes: 30, location: "Downtown clinic" },
    });
  });

  it("maps an event delete", () => {
    const raw = mutationSchema.parse({
      target_type: "event",
      operation: "delete",
      target_id: VALID_TARGET_ID,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      location: null,
      event: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({ targetType: "event", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps an event update, including only the fields actually provided", () => {
    const raw = mutationSchema.parse({
      target_type: "event",
      operation: "update",
      target_id: VALID_TARGET_ID,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      location: "Downtown clinic",
      event: null,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "event",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { location: "Downtown clinic" },
    });
  });

  it("maps an event transition", () => {
    const raw = mutationSchema.parse({
      target_type: "event",
      operation: "transition",
      target_id: VALID_TARGET_ID,
      title: null,
      date: null,
      time: null,
      duration_minutes: null,
      location: null,
      event: "user_marks_event_done",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "event",
      operation: "transition",
      targetId: VALID_TARGET_ID,
      event: "user_marks_event_done",
    });
  });

  it("maps a to-do list create", () => {
    const raw = mutationSchema.parse({ target_type: "todo_list", operation: "create", target_id: null, course_id: VALID_COURSE_ID, name: "Misc" });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "todo_list",
      operation: "create",
      payload: { name: "Misc", course_id: VALID_COURSE_ID },
    });
  });

  it("maps a to-do list rename (update)", () => {
    const raw = mutationSchema.parse({
      target_type: "todo_list",
      operation: "update",
      target_id: VALID_TARGET_ID,
      course_id: null,
      name: "New name",
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "todo_list",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { name: "New name" },
    });
  });

  it("maps a to-do list delete", () => {
    const raw = mutationSchema.parse({ target_type: "todo_list", operation: "delete", target_id: VALID_TARGET_ID, course_id: null, name: null });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({ targetType: "todo_list", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a task create with a list_id", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Read chapter 3",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      list_id: VALID_TARGET_ID,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "task",
      operation: "create",
      payload: { title: "Read chapter 3", due_at: null, priority: "Medium", list_id: VALID_TARGET_ID },
    });
  });

  it("maps a task update with a list_id, moving it into that Board List", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "update",
      target_id: VALID_TARGET_ID,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      list_id: VALID_COURSE_ID,
    });
    expect(toPendingMutation(raw, NOW, TIMEZONE)).toEqual({
      targetType: "task",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { list_id: VALID_COURSE_ID },
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

  // Production incident (2026-09-21): a spoken "PHYS 6540" could never match the model-facing course
  // list, which carried only id + name ("Structure, Defects and Diffusion"), so a deadline create had
  // no course_id to fill in and the whole turn failed.
  it("includes each course's code, so a spoken course code can be matched to its id", async () => {
    const { userId, client } = await createAuthenticatedUser();
    const withCode = await createCourse(admin, userId, { name: "Structure, Defects and Diffusion", code: "PHYS 6540" });
    const withoutCode = await createCourse(admin, userId, { name: "TA Duty - Meeting", code: null });

    const context = await loadEntityContext(client, userId);

    expect(context.courses).toContainEqual({ id: withCode, code: "PHYS 6540", name: "Structure, Defects and Diffusion" });
    expect(context.courses).toContainEqual({ id: withoutCode, code: null, name: "TA Duty - Meeting" });
  });

  it("lists each open occurrence of a repeating deadline with its due date and status, but drops finished ones (one-offs keep every status)", async () => {
    const { userId, client } = await createAuthenticatedUser();
    const courseId = await createCourse(admin, userId, { name: "CS 101" });
    const due = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

    const finishedId = await createDeadline(admin, userId, courseId, { title: "Weekly quiz", due_at: due(-14), recurrence_days: [1] });
    await admin.from("deadlines").update({ status: "Cancelled" }).eq("id", finishedId);
    const openId = await createDeadline(admin, userId, courseId, { title: "Weekly quiz", due_at: due(2), recurrence_days: [1] });
    const oneOffId = await createDeadline(admin, userId, courseId, { title: "Essay", due_at: due(5) });
    await admin.from("deadlines").update({ status: "Cancelled" }).eq("id", oneOffId);

    const context = await loadEntityContext(client, userId);

    const byId = new Map(context.deadlines.map((d) => [d.id, d]));
    expect(byId.has(finishedId)).toBe(false);
    expect(byId.get(openId)).toMatchObject({ title: "Weekly quiz", status: "Not Started", recurring: true });
    expect(new Date(byId.get(openId)!.due_at).getTime()).toBeGreaterThan(Date.now());
    expect(byId.get(oneOffId)).toMatchObject({ status: "Cancelled", recurring: false });
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
