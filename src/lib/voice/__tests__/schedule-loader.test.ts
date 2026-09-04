import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createPerson,
  createSession,
  createTask,
  createTodoItem,
  createTodoList,
  walkTransitions,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { loadSchedule, toScheduleToolPayload } from "../schedule-loader";

// Ported from session.test.ts's old "upcoming_schedule" describe block once
// this status-filtering/window-scoping/context-labeling logic moved out of
// session.ts's retired runUpcomingScheduleQuery and into loadSchedule
// (schedule-loader.ts) — the assertions are unchanged, only the call site.
describe("loadSchedule", () => {
  const admin = adminClient();
  let userId: string;
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    userId = user.userId;
  });

  it("excludes completed/done items and items outside the requested 'today' window, includes open Course To-Do items, and carries course/list context", async () => {
    const courseId = await createCourse(admin, userId, { name: "Schedule scoping course" });
    const listId = await createTodoList(admin, userId, { name: "Project: Scoping canary" });

    const now = new Date();
    const todayNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0)).toISOString();
    const tomorrowNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0)).toISOString();
    const todayDateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const tomorrowDate = new Date(now.getTime() + 86_400_000);
    const tomorrowDateKey = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;

    await createDeadline(admin, userId, courseId, { title: "Open deadline due today", due_at: todayNoonUtc });

    const completedDeadlineId = await createDeadline(admin, userId, courseId, {
      title: "Completed deadline due today",
      due_at: todayNoonUtc,
    });
    await walkTransitions(admin, "deadlines", completedDeadlineId, "status", ["In Progress", "Submitted", "Completed"]);

    await createTask(admin, userId, { title: "Open task due today", due_at: todayNoonUtc });

    const doneTaskId = await createTask(admin, userId, { title: "Done task due today", due_at: todayNoonUtc });
    await walkTransitions(admin, "tasks", doneTaskId, "status", ["Done"]);

    await createDeadline(admin, userId, courseId, { title: "Deadline due tomorrow", due_at: tomorrowNoonUtc });

    // Course To-Do / custom-project item due today -- must show up just
    // like a Deadline or Task would.
    await createTodoItem(admin, userId, listId, { title: "Open todo item due today", due_date: todayDateKey });
    const doneTodoItemId = await createTodoItem(admin, userId, listId, { title: "Done todo item due today", due_date: todayDateKey });
    await admin.from("todo_items").update({ is_done: true }).eq("id", doneTodoItemId);
    await createTodoItem(admin, userId, listId, { title: "Todo item due tomorrow", due_date: tomorrowDateKey });

    const result = await loadSchedule(user.client, userId, "today", now);

    const titles = result.scheduleItems.map((item) => item.title);
    expect(titles).toContain("Open deadline due today");
    expect(titles).toContain("Open task due today");
    expect(titles).toContain("Open todo item due today");
    expect(titles).not.toContain("Completed deadline due today");
    expect(titles).not.toContain("Done task due today");
    expect(titles).not.toContain("Done todo item due today");
    expect(titles).not.toContain("Deadline due tomorrow");
    expect(titles).not.toContain("Todo item due tomorrow");

    // Course/list name context, for the "Title (context)" narration
    // convention the conversational core's system prompt asks for.
    const deadlineItem = result.scheduleItems.find((item) => item.title === "Open deadline due today");
    expect(deadlineItem?.context).toBe("Schedule scoping course");
    const todoItem = result.scheduleItems.find((item) => item.title === "Open todo item due today");
    expect(todoItem?.context).toBe("Project: Scoping canary");

    // Everything due today lands in a single ranked day-group.
    expect(result.rankedSchedule).toHaveLength(1);
    const rankedTitles = result.rankedSchedule[0].items.map((item) => item.title);
    expect(rankedTitles).toEqual(expect.arrayContaining(["Open deadline due today", "Open task due today", "Open todo item due today"]));

    const courseNames = result.courses.map((c) => c.name);
    expect(courseNames).toContain("Schedule scoping course");
  });

  it("falls back to the unscoped next-N behavior when no time window is requested", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const courseId = await createCourse(admin, freshUserId, { name: "Unscoped course" });
    await createDeadline(admin, freshUserId, courseId, {
      title: "Some far-future deadline",
      due_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });

    const result = await loadSchedule(client, freshUserId, "unscoped");

    expect(result.scheduleItems.map((item) => item.title)).toContain("Some far-future deadline");
  });

  // Regression: a tracked Person's (0013_people.sql -- e.g. a family
  // member's) courses/deadlines/tasks are stored under the account owner's
  // own user_id via a nullable person_id column, so a bare .eq("user_id", ...)
  // filter alone previously let another tracked person's schedule bleed
  // into "what should I do today?" answers -- exactly the bug this test
  // guards against, mirroring the filter already applied in
  // src/app/api/intelligence/route.ts.
  it("excludes a tracked Person's courses/deadlines/tasks, keeping only the account owner's own", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, freshUserId, { name: "Sister" });

    const myCourseId = await createCourse(admin, freshUserId, { name: "My own course" });
    await createDeadline(admin, freshUserId, myCourseId, { title: "My own deadline due today", due_at: new Date().toISOString() });
    await createTask(admin, freshUserId, { title: "My own task due today", due_at: new Date().toISOString() });

    const herCourseId = await createCourse(admin, freshUserId, { name: "Sister's course", person_id: personId });
    await createDeadline(admin, freshUserId, herCourseId, {
      title: "Sister's deadline due today",
      due_at: new Date().toISOString(),
      person_id: personId,
    });
    await createTask(admin, freshUserId, { title: "Sister's task due today", due_at: new Date().toISOString(), person_id: personId });

    const result = await loadSchedule(client, freshUserId, "today");

    const titles = result.scheduleItems.map((item) => item.title);
    expect(titles).toContain("My own deadline due today");
    expect(titles).toContain("My own task due today");
    expect(titles).not.toContain("Sister's deadline due today");
    expect(titles).not.toContain("Sister's task due today");

    const courseNames = result.courses.map((c) => c.name);
    expect(courseNames).toContain("My own course");
    expect(courseNames).not.toContain("Sister's course");
  });

  // The inverse of the test above: passing personId (get_person_schedule)
  // flips the filter to that person's items only, and must exclude the
  // account owner's own -- the two modes never blend together.
  it("with a personId, returns only that person's Tasks and excludes the account owner's own", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, freshUserId, { name: "Sister" });

    const myCourseId = await createCourse(admin, freshUserId, { name: "My own course" });
    await createDeadline(admin, freshUserId, myCourseId, { title: "My own deadline due today", due_at: new Date().toISOString() });
    await createTask(admin, freshUserId, { title: "My own task due today", due_at: new Date().toISOString() });

    const herCourseId = await createCourse(admin, freshUserId, { name: "Sister's course", person_id: personId });
    await createDeadline(admin, freshUserId, herCourseId, {
      title: "Sister's deadline due today",
      due_at: new Date().toISOString(),
      person_id: personId,
    });
    await createTask(admin, freshUserId, { title: "Sister's task due today", due_at: new Date().toISOString(), person_id: personId });

    const result = await loadSchedule(client, freshUserId, "today", undefined, personId);

    const titles = result.scheduleItems.map((item) => item.title);
    expect(titles).toContain("Sister's task due today");
    // Deadlines are never part of a tracked Person's schedule (product
    // decision -- a Person is never assigned a Deadline directly in this
    // app), so this stays excluded even though the row's person_id is
    // genuinely set to her.
    expect(titles).not.toContain("Sister's deadline due today");
    expect(titles).not.toContain("My own deadline due today");
    expect(titles).not.toContain("My own task due today");

    const courseNames = result.courses.map((c) => c.name);
    expect(courseNames).toContain("Sister's course");
    expect(courseNames).not.toContain("My own course");
  });

  // Regression: todoItemsQuery previously ran unconditionally regardless of
  // personId, so a tracked Person's schedule silently included the account
  // owner's own Course To-Do items -- the direct, confirmed cause of a real
  // observed bug (asking about a tracked Person's schedule returned the
  // owner's own to-dos, mislabeled as hers).
  it("with a personId, never includes the account owner's own Course To-Do items", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, freshUserId, { name: "Sister" });

    const listId = await createTodoList(admin, freshUserId, { name: "My own project" });
    const todayDateKey = new Date().toISOString().slice(0, 10);
    await createTodoItem(admin, freshUserId, listId, { title: "My own todo due today", due_date: todayDateKey });

    const result = await loadSchedule(client, freshUserId, "today", undefined, personId);

    expect(result.scheduleItems.map((item) => item.kind)).not.toContain("todo");
    expect(result.scheduleItems.map((item) => item.title)).not.toContain("My own todo due today");
  });

  it("includes the account owner's own planned Deadline Sessions, with the Deadline's title as context", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const courseId = await createCourse(admin, freshUserId, { name: "Session scoping course" });
    const deadlineId = await createDeadline(admin, freshUserId, courseId, { title: "Consensus Protocol Essay" });
    const todayDateKey = new Date().toISOString().slice(0, 10);
    await createSession(admin, freshUserId, deadlineId, { title: "Outline draft", date: todayDateKey, time: "Starting at 7:00 PM" });

    const result = await loadSchedule(client, freshUserId, "today");

    const sessionItem = result.scheduleItems.find((item) => item.kind === "session" && item.title === "Outline draft");
    expect(sessionItem).toBeDefined();
    expect(sessionItem?.context).toBe("Consensus Protocol Essay — Starting at 7:00 PM");
  });

  it("excludes Deadline Sessions with a 'done' or 'skipped' status", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const courseId = await createCourse(admin, freshUserId, { name: "Session status course" });
    const deadlineId = await createDeadline(admin, freshUserId, courseId, { title: "Some Deadline" });
    const todayDateKey = new Date().toISOString().slice(0, 10);
    const doneSessionId = await createSession(admin, freshUserId, deadlineId, { title: "Done session", date: todayDateKey });
    await walkTransitions(admin, "appointments", doneSessionId, "session_status", ["done"]);
    const skippedSessionId = await createSession(admin, freshUserId, deadlineId, { title: "Skipped session", date: todayDateKey });
    await walkTransitions(admin, "appointments", skippedSessionId, "session_status", ["skipped"]);

    const result = await loadSchedule(client, freshUserId, "today");

    const titles = result.scheduleItems.map((item) => item.title);
    expect(titles).not.toContain("Done session");
    expect(titles).not.toContain("Skipped session");
  });

  it("with a personId, never includes the account owner's own Deadline Sessions", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, freshUserId, { name: "Sister" });
    const courseId = await createCourse(admin, freshUserId, { name: "My own course" });
    const deadlineId = await createDeadline(admin, freshUserId, courseId, { title: "My own deadline" });
    const todayDateKey = new Date().toISOString().slice(0, 10);
    await createSession(admin, freshUserId, deadlineId, { title: "My own session", date: todayDateKey });

    const result = await loadSchedule(client, freshUserId, "today", undefined, personId);

    expect(result.scheduleItems.map((item) => item.kind)).not.toContain("session");
    expect(result.scheduleItems.map((item) => item.title)).not.toContain("My own session");
  });

  it("includes the account owner's own Course meeting occurrences for today's weekday", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const now = new Date();
    const todayDayOfWeek = now.getUTCDay();
    await createCourse(admin, freshUserId, {
      name: "Recurring Course",
      meeting_blocks: [{ days: [todayDayOfWeek], startMinutes: 600, endMinutes: 650 }],
    });

    const result = await loadSchedule(client, freshUserId, "today", now);

    const courseItem = result.scheduleItems.find((item) => item.kind === "course" && item.title === "Recurring Course");
    expect(courseItem).toBeDefined();
  });

  it("includes only a tracked Person's own Course meeting occurrences, scoped by personId", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const personId = await createPerson(admin, freshUserId, { name: "Sister" });
    const now = new Date();
    const todayDayOfWeek = now.getUTCDay();
    await createCourse(admin, freshUserId, {
      name: "Sister's Recurring Course",
      person_id: personId,
      meeting_blocks: [{ days: [todayDayOfWeek], startMinutes: 600, endMinutes: 650 }],
    });
    await createCourse(admin, freshUserId, {
      name: "My Recurring Course",
      meeting_blocks: [{ days: [todayDayOfWeek], startMinutes: 700, endMinutes: 750 }],
    });

    const result = await loadSchedule(client, freshUserId, "today", now, personId);

    const courseTitles = result.scheduleItems.filter((item) => item.kind === "course").map((item) => item.title);
    expect(courseTitles).toContain("Sister's Recurring Course");
    expect(courseTitles).not.toContain("My Recurring Course");
  });

  it("excludes a Course meeting occurrence once recurrence_end_date has passed, even on a matching weekday", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const now = new Date();
    const todayDayOfWeek = now.getUTCDay();
    const yesterdayKey = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    await createCourse(admin, freshUserId, {
      name: "Ended Course",
      meeting_blocks: [{ days: [todayDayOfWeek], startMinutes: 600, endMinutes: 650 }],
      recurrence_end_date: yesterdayKey,
    });

    const result = await loadSchedule(client, freshUserId, "today", now);

    expect(result.scheduleItems.map((item) => item.title)).not.toContain("Ended Course");
  });

  it("excludes a Course meeting occurrence when today's weekday isn't in the block's days", async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const now = new Date();
    const nonMatchingDayOfWeek = (now.getUTCDay() + 1) % 7;
    await createCourse(admin, freshUserId, {
      name: "Non-matching Course",
      meeting_blocks: [{ days: [nonMatchingDayOfWeek], startMinutes: 600, endMinutes: 650 }],
    });

    const result = await loadSchedule(client, freshUserId, "today", now);

    expect(result.scheduleItems.map((item) => item.title)).not.toContain("Non-matching Course");
  });

  it('"date" window returns only items on the explicit date, unrelated to now\'s offset', async () => {
    const { userId: freshUserId, client } = await createAuthenticatedUser();
    const courseId = await createCourse(admin, freshUserId, { name: "Date-mode course" });
    const targetDateKey = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const dayBeforeKey = new Date(new Date(`${targetDateKey}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

    await createDeadline(admin, freshUserId, courseId, { title: "Due on target date", due_at: `${targetDateKey}T12:00:00.000Z` });
    await createDeadline(admin, freshUserId, courseId, { title: "Due the day before", due_at: `${dayBeforeKey}T12:00:00.000Z` });

    const result = await loadSchedule(client, freshUserId, "date", new Date(), undefined, targetDateKey);

    const titles = result.scheduleItems.map((item) => item.title);
    expect(titles).toContain("Due on target date");
    expect(titles).not.toContain("Due the day before");
  });
});

// Regression test for a real, reproduced hallucination: a model narrating a
// get_schedule/get_person_schedule result fabricated a course meeting on a
// day it didn't actually occur on. Root cause confirmed by direct testing
// (not fixable by dropping meeting_blocks from the course shape, nor by a
// higher reasoning_effort): the mere presence of a top-level "courses" name
// list in the tool payload was enough to trigger it, entirely independent of
// rankedSchedule's own (correct, empty) content. toScheduleToolPayload must
// never expose that list to the model at all.
describe("toScheduleToolPayload", () => {
  const admin = adminClient();

  it("never includes a top-level courses list, even when the underlying result has courses", async () => {
    const { userId, client } = await createAuthenticatedUser();
    await createCourse(admin, userId, { name: "Should never reach the model" });

    const result = await loadSchedule(client, userId, "today");
    const payload = toScheduleToolPayload(result);

    expect(payload).toEqual({ rankedSchedule: result.rankedSchedule });
    expect(payload).not.toHaveProperty("courses");
    // Sanity check the fixture actually proves something: the underlying
    // result truly does carry the course this payload must still exclude.
    expect(result.courses.some((c) => c.name === "Should never reach the model")).toBe(true);
  });
});
