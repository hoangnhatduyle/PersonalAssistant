import { expect, test } from "@playwright/test";
import { createTask, createTodoList } from "../supabase/tests/helpers";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation } from "./fixtures";

// Real model, no mocks (same as the other assistant-*.spec.ts files). "Reopen"
// and "duplicate" mean the same thing: copy a Done card into a fresh Open one.

async function doneTask(userId: string, title: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask(admin, userId, { title, ...overrides });
  const { error } = await admin.from("tasks").update({ status: "Done" }).eq("id", id);
  if (error) throw new Error(error.message);
  return id;
}

async function liveCards(userId: string, titleFragment: string) {
  const { data } = await admin
    .from("tasks")
    .select("id, title, status, due_at, completed_at, list_id")
    .eq("user_id", userId)
    .ilike("title", `%${titleFragment}%`)
    .is("deleted_at", null)
    .order("created_at");
  return data ?? [];
}

test.describe("assistant: reopen / duplicate a closed card", () => {
  test("'reopen' asks for the new due date, then copies the Done card on confirm", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const listId = await createTodoList(admin, user.userId, { name: "Reading" });
    const sourceId = await doneTask(user.userId, "Read Paper A", { list_id: listId, priority: "High" });
    await openAssistant(page);

    const question = await askAssistant(page, "Reopen Read Paper A");
    expect(question.toLowerCase()).toContain("due date");
    expect(await liveCards(user.userId, "paper a")).toHaveLength(1); // nothing created yet

    await runMutation(page, "No due date");

    const cards = await liveCards(user.userId, "paper a");
    expect(cards).toHaveLength(2);
    const original = cards.find((card) => card.id === sourceId)!;
    const copy = cards.find((card) => card.id !== sourceId)!;
    expect(original.status).toBe("Done");
    expect(original.completed_at).not.toBeNull();
    expect(copy).toMatchObject({ status: "Open", due_at: null, completed_at: null, list_id: listId });
  });

  test("'duplicate' is the same action, and a due date in the request is applied to the copy", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const sourceId = await doneTask(user.userId, "Read Paper B");
    await openAssistant(page);

    await runMutation(page, "Duplicate Read Paper B, due October 20th 2099 at 5pm");

    const cards = await liveCards(user.userId, "paper b");
    expect(cards).toHaveLength(2);
    const copy = cards.find((card) => card.id !== sourceId)!;
    expect(copy.status).toBe("Open");
    expect(copy.due_at).not.toBeNull();
    expect(new Date(copy.due_at!).getUTCFullYear()).toBe(2099);
    expect(cards.find((card) => card.id === sourceId)!.status).toBe("Done");
  });

  test("with no closed card of that name, it offers to create a brand-new card instead", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await doneTask(user.userId, "Read Paper A");
    await openAssistant(page);

    const question = await askAssistant(page, "Duplicate Read Paper Z");
    expect(question.toLowerCase()).toMatch(/brand-new|new card/);
    expect(await liveCards(user.userId, "paper z")).toHaveLength(0); // asked, did not act

    await runMutation(page, "Yes, create it");

    const created = await liveCards(user.userId, "paper z");
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("Open");
    // The unrelated Done card was left alone.
    expect(await liveCards(user.userId, "paper a")).toHaveLength(1);
  });

  test("when an Open card shares the name, 'mark it done' acts on the Open one", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const closedId = await doneTask(user.userId, "Read Paper A");
    const { data: closedBefore } = await admin.from("tasks").select("completed_at").eq("id", closedId).single();
    const openId = await createTask(admin, user.userId, { title: "Read Paper A" });
    await openAssistant(page);

    await runMutation(page, "Mark Read Paper A as done");

    expect((await admin.from("tasks").select("status").eq("id", openId).single()).data?.status).toBe("Done");
    const { data: closedAfter } = await admin.from("tasks").select("status, completed_at").eq("id", closedId).single();
    expect(closedAfter).toEqual({ status: "Done", completed_at: closedBefore?.completed_at });
  });

  test("when an Open card already has the name, reopening checks before making another copy", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await doneTask(user.userId, "Read Paper A");
    await createTask(admin, user.userId, { title: "Read Paper A" });
    await openAssistant(page);

    const question = await askAssistant(page, "Reopen Read Paper A");
    expect(question.toLowerCase()).toContain("already");
    expect(await liveCards(user.userId, "paper a")).toHaveLength(2); // still just the original pair
  });
});
