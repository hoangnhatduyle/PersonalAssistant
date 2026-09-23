import { expect, test } from "@playwright/test";
import { createDeadline, createTask, walkTransitions } from "../supabase/tests/helpers";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation, runMutationChain, seedCourse } from "./fixtures";

// New coverage added after the Responses API migration (gpt-5.6-luna,
// reasoning effort "low") -- exercises entity/operation combinations the
// existing assistant-*.spec.ts files never touched (courses as a direct
// mutation target, the full Deadline transition chain via voice, Deadline
// Sessions, plain Tasks outside the board-card flow, a course-scoped Board
// List) plus a few scenarios chosen to stress the smarter model's judgment
// (spoken-code disambiguation, a compound "both" request, and an
// unsupported-operation request that must be answered, not guessed at).

test.describe("assistant: Courses", () => {
  test("create, update, and delete a course", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "Add a course called Organic Chemistry with code CHEM 201 for the Fall term");
    const { data: created } = await admin.from("courses").select("id, name, code, term").eq("user_id", user.userId).is("deleted_at", null);
    expect(created).toHaveLength(1);
    expect(created![0].name.toLowerCase()).toContain("organic chemistry");
    expect(created![0].code?.toUpperCase()).toContain("CHEM 201");
    const id = created![0].id;

    await runMutation(page, "Rename my Organic Chemistry course to Organic Chemistry II");
    const { data: renamed } = await admin.from("courses").select("name").eq("id", id).single();
    expect(renamed?.name.toLowerCase()).toContain("organic chemistry ii");

    await runMutation(page, "Delete my Organic Chemistry II course");
    const { data: deleted } = await admin.from("courses").select("deleted_at").eq("id", id).single();
    expect(deleted?.deleted_at).not.toBeNull();
  });

  test("a deadline created in a later turn resolves a course created earlier in the same conversation", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "Add a course called Data Structures with code CS 250");
    const { data: course } = await admin.from("courses").select("id").eq("user_id", user.userId).is("deleted_at", null).single();
    expect(course).not.toBeNull();

    expect(await askAssistant(page, "Add a deadline called Final Project for my Data Structures course due 2030-05-20 at noon")).toMatch(/repeat/i);
    await runMutation(page, "No");

    const { data: deadline } = await admin.from("deadlines").select("title, course_id").eq("user_id", user.userId).is("deleted_at", null).single();
    expect(deadline?.title.toLowerCase()).toContain("final project");
    expect(deadline?.course_id).toBe(course!.id);
  });

  test("deleting a course cascades to its deadlines, and the assistant says so", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "PHYS 1010");
    await createDeadline(admin, user.userId, courseId, { title: "Lab Report 3" });
    await openAssistant(page);

    const { result } = await runMutation(page, "Delete my PHYS 1010 course");
    expect(result.toLowerCase()).toMatch(/deadline/);
    const { data: deadlines } = await admin.from("deadlines").select("deleted_at").eq("course_id", courseId);
    expect(deadlines!.every((d) => d.deleted_at !== null)).toBe(true);
  });
});

test.describe("assistant: Deadline Sessions", () => {
  // Deliberately distinct titles ("First Review Session" / "Second Review
  // Session") rather than two same-named sessions differing only by date --
  // the `sessions` entity context the model is given exposes only {id,
  // title, deadline_id}, no date (see conversation-core.ts's system prompt),
  // so two identically-titled sessions genuinely cannot be disambiguated by
  // the model from title alone. (Confirmed separately: asking to mark "the
  // session on April 5th" when both sessions shared a title correctly made
  // the assistant decline rather than guess -- a real, worth-knowing product
  // gap, not a bug in this test.)
  test("create a session for a deadline, mark it done, create another, mark it skipped, then delete it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "MATH 301");
    await createDeadline(admin, user.userId, courseId, { title: "Final Exam" });
    await openAssistant(page);

    await runMutation(page, "Add a study session called First Review Session for my Final Exam deadline on 2030-04-01 at 6pm for 90 minutes");
    const { data: sessions } = await admin.from("appointments").select("id, title, deadline_id, session_status").eq("user_id", user.userId).eq("category", "Session");
    expect(sessions).toHaveLength(1);
    const firstId = sessions![0].id;

    await runMutation(page, "Mark my First Review Session as done");
    expect((await admin.from("appointments").select("session_status").eq("id", firstId).single()).data?.session_status).toBe("done");

    await runMutation(page, "Add another study session called Second Review Session for my Final Exam deadline on 2030-04-05 at 6pm for 90 minutes");
    const { data: sessionsAfter } = await admin
      .from("appointments")
      .select("id, session_status")
      .eq("user_id", user.userId)
      .eq("category", "Session")
      .neq("id", firstId);
    expect(sessionsAfter).toHaveLength(1);
    const secondId = sessionsAfter![0].id;

    await runMutation(page, "Mark my Second Review Session as skipped");
    expect((await admin.from("appointments").select("session_status").eq("id", secondId).single()).data?.session_status).toBe("skipped");

    await runMutation(page, "Delete my Second Review Session");
    const { data: afterDelete } = await admin.from("appointments").select("deleted_at").eq("id", secondId).single();
    expect(afterDelete?.deleted_at).not.toBeNull();
  });
});

test.describe("assistant: Deadlines (full transition chain + update fields)", () => {
  test("walks a freshly created deadline through in progress -> submitted -> done entirely by voice", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "ENGL 210");
    await openAssistant(page);

    expect(await askAssistant(page, "Add a deadline called Reading Response for my ENGL 210 course due 2030-02-01 at 9am")).toMatch(/repeat/i);
    await runMutation(page, "No");
    const { data: created } = await admin.from("deadlines").select("id, status").eq("user_id", user.userId).is("deleted_at", null).single();
    const id = created!.id;
    expect(created!.status).toBe("Not Started");

    await runMutation(page, "Mark my Reading Response deadline as in progress");
    expect((await admin.from("deadlines").select("status").eq("id", id).single()).data?.status).toBe("In Progress");

    await runMutation(page, "Mark my Reading Response deadline as submitted");
    expect((await admin.from("deadlines").select("status").eq("id", id).single()).data?.status).toBe("Submitted");

    await runMutation(page, "Mark my Reading Response deadline as done");
    expect((await admin.from("deadlines").select("status").eq("id", id).single()).data?.status).toBe("Completed");
  });

  test("cancels a Not Started deadline directly, and renames another", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseA = await seedCourse(user.userId, "HIST 100");
    await createDeadline(admin, user.userId, courseA, { title: "Pop Quiz" });
    const renameId = await createDeadline(admin, user.userId, courseA, { title: "Term Paper" });
    await openAssistant(page);

    await runMutation(page, "Cancel my Pop Quiz deadline");
    const { data: cancelled } = await admin.from("deadlines").select("status").eq("course_id", courseA).eq("title", "Pop Quiz").single();
    expect(cancelled?.status).toBe("Cancelled");

    await runMutation(page, "Rename my Term Paper deadline to Final Term Paper");
    const { data: renamed } = await admin.from("deadlines").select("title").eq("id", renameId).single();
    expect(renamed?.title.toLowerCase()).toContain("final term paper");
  });

  // FINDING (pre-existing, not caused by this migration): deadlinePatchSchema
  // (src/lib/api/schemas.ts) deliberately omits course_id -- a Deadline's
  // course is immutable after creation, by the same design as a Session's
  // deadline_id. But propose_mutation's tool schema exposes course_id
  // unconditionally on every operation including "update", with nothing
  // telling the model it's create-only. Asked to "move" a deadline to a
  // different course, gpt-5.6-luna correctly matched the target course and
  // even spoke a confirmation naming both courses ("move it from HIST 100 to
  // HIST 200") -- but the actual update silently dropped course_id (the app
  // layer enforcing its own invariant), so the executed change was only the
  // title. The confirmation prompt over-promised what actually happened,
  // which a user has no way to notice from the UI alone. Worth either
  // exposing course reassignment as a real supported update, or narrowing
  // the tool schema/system prompt so the model never proposes it in the
  // first place.
  test("a 'move to a different course' request is accepted and confirmed, but the course silently does not change (documents a real gap)", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseA = await seedCourse(user.userId, "HIST 300");
    const courseB = await seedCourse(user.userId, "HIST 400");
    const id = await createDeadline(admin, user.userId, courseA, { title: "Book Review" });
    await openAssistant(page);

    const { prompt } = await runMutation(page, "Move my Book Review deadline to my HIST 400 course");
    expect(prompt.toLowerCase()).toMatch(/hist 400/);

    const { data } = await admin.from("deadlines").select("course_id").eq("id", id).single();
    // Documents current (unintended-looking) behavior, not desired behavior --
    // see the FINDING comment above. If this assertion ever starts failing
    // because course_id actually changed, the finding above is resolved and
    // this test should be rewritten to assert the successful move instead.
    expect(data?.course_id).toBe(courseA);
  });
});

test.describe("assistant: Tasks (plain, outside the board-card flow)", () => {
  test("create with a reminder phrase and explicit priority, update, mark done", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "Add a high priority task to renew my passport, due 2030-01-15, remind me 2 hours before");
    const { data: created } = await admin
      .from("tasks")
      .select("id, title, priority, reminder_lead_minutes")
      .eq("user_id", user.userId)
      .is("deleted_at", null);
    expect(created).toHaveLength(1);
    expect(created![0].title.toLowerCase()).toContain("passport");
    expect(created![0].priority).toBe("High");
    expect(created![0].reminder_lead_minutes).toBe(120);
    const id = created![0].id;

    await runMutation(page, "Change the priority of my renew my passport task to Urgent");
    expect((await admin.from("tasks").select("priority").eq("id", id).single()).data?.priority).toBe("Urgent");

    await runMutation(page, "Mark my renew my passport task as done");
    expect((await admin.from("tasks").select("status").eq("id", id).single()).data?.status).toBe("Done");
  });

  test("cancel a task and delete another", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const cancelId = await createTask(admin, user.userId, { title: "Call the bank" });
    const deleteId = await createTask(admin, user.userId, { title: "Old Reminder" });
    await openAssistant(page);

    await runMutation(page, "Cancel my Call the bank task");
    expect((await admin.from("tasks").select("status").eq("id", cancelId).single()).data?.status).toBe("Cancelled");

    await runMutation(page, "Delete my Old Reminder task");
    expect((await admin.from("tasks").select("deleted_at").eq("id", deleteId).single()).data?.deleted_at).not.toBeNull();
  });
});

test.describe("assistant: Board Lists tied to a course", () => {
  test("creates a Board List scoped to a specific course", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseId = await seedCourse(user.userId, "CS 340");
    await openAssistant(page);

    await runMutation(page, "Create a reading list for my CS 340 course");
    const { data: lists } = await admin.from("todo_lists").select("id, name, course_id").eq("user_id", user.userId).is("deleted_at", null);
    expect(lists).toHaveLength(1);
    expect(lists![0].course_id).toBe(courseId);
  });
});

test.describe("assistant: smarter-model scenarios", () => {
  test("matches a course by its spelled-out code among two near-identical codes", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "PHYS 6540");
    const correctId = await seedCourse(user.userId, "PHYS 6541");
    await openAssistant(page);

    expect(await askAssistant(page, "Add a deadline called Problem Set 4 for P H Y S six five four one due 2030-03-01")).toMatch(/repeat/i);
    await runMutation(page, "No");

    const { data: deadline } = await admin.from("deadlines").select("course_id").eq("user_id", user.userId).is("deleted_at", null).single();
    expect(deadline?.course_id).toBe(correctId);
  });

  test("a compound 'mark them both done' resolves two distinct deadlines via the queued-step chain", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const courseA = await seedCourse(user.userId, "BIO 101");
    const courseB = await seedCourse(user.userId, "CHEM 101");
    const dueSoon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const idA = await createDeadline(admin, user.userId, courseA, { title: "Lab Report A", due_at: dueSoon });
    const idB = await createDeadline(admin, user.userId, courseB, { title: "Lab Report B", due_at: dueSoon });
    // Deadlines must be inserted "Not Started" (DB trigger) -- walk each to
    // "Submitted" first, the only state "done" (user_confirms_done) is a
    // legal transition from. (Walking only to "In Progress" and asking for
    // "done" directly is a genuinely invalid transition request -- tried
    // separately, and the assistant's handling of it was inconsistent run to
    // run, worth a follow-up investigation on its own, not folded into this
    // otherwise-unrelated queued-step-chain test.)
    await walkTransitions(admin, "deadlines", idA, "status", ["In Progress", "Submitted"]);
    await walkTransitions(admin, "deadlines", idB, "status", ["In Progress", "Submitted"]);
    await openAssistant(page);

    await runMutationChain(page, "Mark my Lab Report A and Lab Report B deadlines as done");

    expect((await admin.from("deadlines").select("status").eq("id", idA).single()).data?.status).toBe("Completed");
    expect((await admin.from("deadlines").select("status").eq("id", idB).single()).data?.status).toBe("Completed");
  });

  test("an unsupported monthly-recurrence request gets a real clarifying answer instead of a silent guess", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedCourse(user.userId, "ART 150");
    await openAssistant(page);

    const answer = await askAssistant(page, "Add a deadline called Monthly Critique for my ART 150 course, repeating on the first of every month");
    expect(answer).toMatch(/weekly/i);

    const { data } = await admin.from("deadlines").select("id").eq("user_id", user.userId);
    expect(data).toHaveLength(0);
  });
});
