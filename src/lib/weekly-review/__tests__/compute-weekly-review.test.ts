import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAuthenticatedUser,
  createCourse,
  createDeadline,
  createMailAccount,
  createMailTriageItem,
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

  it("includes the user's own unresolved Important / Needs-action triage items, and nobody else's", async () => {
    const mine = await createAuthenticatedUser();
    const myAccount = await createMailAccount(admin, mine.userId);
    await createMailTriageItem(admin, mine.userId, myAccount, { subject: "Sign the lease", bucket: "needs_action" });
    await createMailTriageItem(admin, mine.userId, myAccount, { subject: "Interview details", bucket: "important" });
    await createMailTriageItem(admin, mine.userId, myAccount, { subject: "Newsletter", bucket: "ignore" });
    await createMailTriageItem(admin, mine.userId, myAccount, { subject: "Already handled", bucket: "needs_action", status: "acted" });
    await createMailTriageItem(admin, mine.userId, myAccount, {
      subject: "Expired",
      bucket: "needs_action",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const theirs = await createAuthenticatedUser();
    const theirAccount = await createMailAccount(admin, theirs.userId);
    await createMailTriageItem(admin, theirs.userId, theirAccount, { subject: "Someone else's email", bucket: "needs_action" });

    const { data } = await computeWeeklyReview(mine.client, mine.userId, new Date());

    expect(data.pending.unresolvedEmails?.count).toBe(2);
    expect(data.pending.unresolvedEmails?.items.map((email) => email.subject)).toEqual(["Sign the lease", "Interview details"]);

    const { data: theirData } = await computeWeeklyReview(theirs.client, theirs.userId, new Date());
    expect(theirData.pending.unresolvedEmails?.items.map((email) => email.subject)).toEqual(["Someone else's email"]);

    const nobody = await createAuthenticatedUser();
    const { data: empty } = await computeWeeklyReview(nobody.client, nobody.userId, new Date());
    expect(empty.pending.unresolvedEmails).toBeUndefined();
  });
});
