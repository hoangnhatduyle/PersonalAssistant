import { expect, test } from "@playwright/test";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation, seedCourse } from "./fixtures";

test.describe("assistant: Deadlines", () => {
  test("create with no date/priority defaults to end-of-today + Medium", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await openAssistant(page);

    // A new deadline always gets asked whether it repeats; "no" is the default.
    expect(await askAssistant(page, "Add a deadline called Essay Draft for my CS 101 course")).toMatch(/repeat/i);
    await runMutation(page, "No, it doesn't repeat");

    const { data } = await admin.from("deadlines").select("title, priority, due_at").eq("user_id", user.userId).is("deleted_at", null);
    expect(data).toHaveLength(1);
    expect(data![0].title.toLowerCase()).toContain("essay draft");
    expect(data![0].priority).toBe("Medium");
    // Default due date is the last instant of a calendar day (UTC user tz default): 23:59:59.
    expect(new Date(data![0].due_at).getUTCHours()).toBe(23);
    expect(new Date(data![0].due_at).getUTCMinutes()).toBe(59);
  });

  test("create with explicit date + priority, then update, then delete", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "CS 101");
    await openAssistant(page);

    expect(await askAssistant(page, "Add a high priority deadline called Lab Report for my CS 101 course due 2030-03-15 at 5pm")).toMatch(/repeat/i);
    await runMutation(page, "No");
    const { data: created } = await admin.from("deadlines").select("id, title, priority, due_at").eq("user_id", user.userId).is("deleted_at", null);
    expect(created).toHaveLength(1);
    expect(created![0].priority).toBe("High");
    expect(created![0].due_at).toContain("2030-03-15");
    const id = created![0].id;

    await runMutation(page, "Change the priority of my Lab Report deadline to Urgent");
    const { data: updated } = await admin.from("deadlines").select("priority").eq("id", id).single();
    expect(updated?.priority).toBe("Urgent");

    await runMutation(page, "Delete my Lab Report deadline");
    const { data: deleted } = await admin.from("deadlines").select("deleted_at").eq("id", id).single();
    expect(deleted?.deleted_at).not.toBeNull();
  });

  test("mark done: Not Started -> In Progress, and Submitted -> Completed", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 101");
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { data: rows } = await admin
      .from("deadlines")
      .insert([
        { user_id: user.userId, course_id: courseId, title: "Homework One", due_at: due, status: "Not Started" },
        { user_id: user.userId, course_id: courseId, title: "Project Two", due_at: due, status: "Not Started" },
      ])
      .select("id, title");
    const hw = rows!.find((r) => r.title === "Homework One")!.id;
    const project = rows!.find((r) => r.title === "Project Two")!.id;
    // Walk Project Two to Submitted through the legal edges so "done" is applicable.
    for (const status of ["In Progress", "Submitted"]) {
      const { error } = await admin.from("deadlines").update({ status }).eq("id", project);
      expect(error).toBeNull();
    }
    await openAssistant(page);

    await runMutation(page, "Mark my Homework One deadline as in progress");
    expect((await admin.from("deadlines").select("status").eq("id", hw).single()).data?.status).toBe("In Progress");

    await runMutation(page, "Mark my Project Two deadline as done");
    expect((await admin.from("deadlines").select("status").eq("id", project).single()).data?.status).toBe("Completed");
  });
});
