import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createPerson,
  createTask,
  createTodoItem,
  createTodoList,
  walkTransitions,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { loadSchedule } from "../schedule-loader";

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
});
