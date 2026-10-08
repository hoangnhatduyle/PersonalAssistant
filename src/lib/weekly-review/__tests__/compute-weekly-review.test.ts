import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createSession,
  createTask,
  walkTransitions,
  type TestUser,
} from "../../../../supabase/tests/helpers";
import { computeWeeklyReview } from "../compute-weekly-review";

const DAY_MS = 86_400_000;

// Runs against the local Supabase stack like schedule-loader.test.ts. The
// user has no preferences row, so the timezone is UTC. `completed_at` is
// stamped by a trigger on the first transition into Completed/Done, so the
// completed items are walked through real transitions.
describe("computeWeeklyReview", () => {
  const admin = adminClient();
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
  });

  it("rolls up last week, past due and next week for the signed-in user only", async () => {
    const courseId = await createCourse(admin, user.userId, { name: "Review course" });
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();

    const doneId = await createDeadline(admin, user.userId, courseId, { title: "Finished HW", due_at: at(-2) });
    await walkTransitions(admin, "deadlines", doneId, "status", ["In Progress", "Submitted", "Completed"]);
    await createDeadline(admin, user.userId, courseId, { title: "Slipped HW", due_at: at(-3) });
    const upcomingId = await createDeadline(admin, user.userId, courseId, { title: "Upcoming HW", due_at: at(3) });
    await createSession(admin, user.userId, upcomingId, { date: at(2).slice(0, 10) });
    const doneTaskId = await createTask(admin, user.userId, { title: "Done task", due_at: null });
    await walkTransitions(admin, "tasks", doneTaskId, "status", ["Done"]);

    // Another user's data must never leak in.
    const other = await createAuthenticatedUser();
    const otherCourse = await createCourse(admin, other.userId, { name: "Other course" });
    await createDeadline(admin, other.userId, otherCourse, { title: "Someone else's slip", due_at: at(-4) });

    const { data, recommendations } = await computeWeeklyReview(user.client, user.userId, now);

    expect(data.lastWeek.completedCount).toBe(2);
    expect(data.lastWeek.completedOnTime).toBe(1);
    expect(data.pending.pastDueItems.map((item) => item.title)).toEqual(["Slipped HW"]);
    expect(data.pending.pastDueItems[0].context).toBe("Review course");
    expect(data.nextWeek.items.map((item) => item.title)).toEqual(["Upcoming HW"]);
    expect(data.nextWeek.deadlinesWithoutSessions).toEqual([]);
    expect(recommendations[0]).toContain("Slipped HW");
  });
});
