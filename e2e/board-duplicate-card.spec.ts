import { expect, test, type Page } from "@playwright/test";
import { createTask, createTodoList } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

interface SeededCard {
  taskId: string;
  listId: string;
}

/** A Done card with a checked checklist item, a link and an uploaded-file attachment, and a note. */
async function seedDoneCard(userId: string, title: string): Promise<SeededCard> {
  const listId = await createTodoList(admin, userId, { name: "Reading" });
  const taskId = await createTask(admin, userId, { title, list_id: listId, priority: "High", due_at: "2026-09-29T12:00:00Z" });
  await admin.from("checklist_items").insert({ user_id: userId, task_id: taskId, label: "Skim abstract", is_done: true, position: 0 });
  await admin.from("task_attachments").insert([
    { user_id: userId, task_id: taskId, kind: "link", title: "The paper", url: "https://example.com/paper" },
    { user_id: userId, task_id: taskId, kind: "file", title: "Scan", storage_object_path: `${userId}/scan.pdf` },
  ]);
  await admin.from("notes").insert({ user_id: userId, body: "Notes on the first attempt", linked_task_id: taskId });
  const { error } = await admin.from("tasks").update({ status: "Done" }).eq("id", taskId);
  if (error) throw new Error(error.message);
  return { taskId, listId };
}

async function openCard(page: Page, title: string): Promise<void> {
  await page.goto("/board");
  // Done cards are hidden on the board until "Show completed" is on.
  const showCompleted = page.getByRole("switch", { name: "Show completed" });
  await showCompleted.click();
  await expect(showCompleted).toBeChecked();
  // Open cards are wrapped in a dnd-kit div that also has role=button; target the real <button>.
  await page.getByRole("button", { name: title, exact: true }).and(page.locator("button")).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function liveCopies(userId: string, title: string) {
  const { data } = await admin
    .from("tasks")
    .select("id, status, due_at, completed_at, list_id")
    .eq("user_id", userId)
    .eq("title", title)
    .is("deleted_at", null)
    .order("created_at");
  return data ?? [];
}

test.describe("board: Duplicate as new", () => {
  test("a Done card gets a Duplicate as new button; an Open card does not", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await seedDoneCard(user.userId, "Read Paper A");
    await createTask(admin, user.userId, { title: "Still open" });

    await openCard(page, "Still open");
    await expect(page.getByRole("button", { name: "Mark Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Duplicate as new" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await openCard(page, "Read Paper A");
    await expect(page.getByRole("button", { name: "Duplicate as new" })).toBeVisible();
  });

  test("copies the card, skips the due date, and opens the new Open card", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const { taskId, listId } = await seedDoneCard(user.userId, "Read Paper A");

    await openCard(page, "Read Paper A");
    await page.getByRole("button", { name: "Duplicate as new" }).click();

    await expect(page.getByRole("heading", { name: "Due date for the new card" })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    // The dialog now shows the copy: Open (has a Mark Done action), not the finished original.
    await expect(page.getByRole("heading", { name: "Due date for the new card" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Mark Done" })).toBeVisible();
    await expect(page.getByText("Skim abstract")).toBeVisible();
    await expect(page.getByText("The paper")).toBeVisible();
    await expect(page.getByText("Scan")).toHaveCount(0); // uploaded files are not copied
    await expect(page.getByText("Notes on the first attempt")).toHaveCount(0); // notes stay on the original

    const cards = await liveCopies(user.userId, "Read Paper A");
    expect(cards).toHaveLength(2);
    const original = cards.find((card) => card.id === taskId)!;
    const copy = cards.find((card) => card.id !== taskId)!;
    expect(original.status).toBe("Done");
    expect(original.completed_at).not.toBeNull();
    expect(copy).toMatchObject({ status: "Open", due_at: null, completed_at: null, list_id: listId });

    const { data: items } = await admin.from("checklist_items").select("label, is_done").eq("task_id", copy.id);
    expect(items).toEqual([{ label: "Skim abstract", is_done: false }]);
    const { data: attachments } = await admin.from("task_attachments").select("kind, title").eq("task_id", copy.id);
    expect(attachments).toEqual([{ kind: "link", title: "The paper" }]);
  });

  test("saves the due date picked in the prompt on the new card", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const { taskId } = await seedDoneCard(user.userId, "Read Paper B");

    await openCard(page, "Read Paper B");
    await page.getByRole("button", { name: "Duplicate as new" }).click();

    await page.getByLabel("Due date").fill("2099-10-05T09:00");
    await page.getByRole("button", { name: "Save due date" }).click();
    await expect(page.getByRole("heading", { name: "Due date for the new card" })).toBeHidden();

    const copy = (await liveCopies(user.userId, "Read Paper B")).find((card) => card.id !== taskId)!;
    expect(copy.status).toBe("Open");
    expect(new Date(copy.due_at!).getTime()).toBe(new Date("2099-10-05T09:00").getTime());
  });

  test("the original stays Done, so completion stats keep counting it", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const { taskId } = await seedDoneCard(user.userId, "Read Paper C");
    const { data: before } = await admin.from("tasks").select("completed_at").eq("id", taskId).single();

    await openCard(page, "Read Paper C");
    await page.getByRole("button", { name: "Duplicate as new" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByRole("button", { name: "Mark Done" })).toBeVisible();

    const { data: after } = await admin.from("tasks").select("status, completed_at").eq("id", taskId).single();
    expect(after).toEqual({ status: "Done", completed_at: before?.completed_at });
  });
});
