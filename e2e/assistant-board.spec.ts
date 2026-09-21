import { expect, test } from "@playwright/test";
import { createTask, createTodoList } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn, openAssistant, runMutation } from "./fixtures";

test.describe("assistant: Board lists", () => {
  test("create, rename, and delete a list (delete cascades to its cards)", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "Create a board list called Groceries");
    const { data: lists } = await admin.from("todo_lists").select("id, name").eq("user_id", user.userId).is("deleted_at", null);
    expect(lists).toHaveLength(1);
    expect(lists![0].name.toLowerCase()).toContain("groceries");
    const listId = lists![0].id;

    await runMutation(page, "Rename my Groceries list to Weekly Shopping");
    const { data: renamed } = await admin.from("todo_lists").select("name").eq("id", listId).single();
    expect(renamed?.name.toLowerCase()).toContain("weekly shopping");

    const taskId = await createTask(admin, user.userId, { title: "Buy milk", list_id: listId });
    await runMutation(page, "Delete my Weekly Shopping board list");
    expect((await admin.from("todo_lists").select("deleted_at").eq("id", listId).single()).data?.deleted_at).not.toBeNull();
    expect((await admin.from("tasks").select("deleted_at").eq("id", taskId).single()).data?.deleted_at).not.toBeNull();
  });
});

test.describe("assistant: Board cards", () => {
  test("add a card to a named list, and to Miscellaneous when no list is named", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const listId = await createTodoList(admin, user.userId, { name: "Reading List" });
    await openAssistant(page);

    await runMutation(page, "Add a card called Read chapter 3 to my Reading List");
    await runMutation(page, "Add a task called Call the bank");

    const { data: tasks } = await admin.from("tasks").select("title, list_id, priority, due_at").eq("user_id", user.userId).is("deleted_at", null);
    expect(tasks).toHaveLength(2);
    const chapter = tasks!.find((t) => t.title.toLowerCase().includes("chapter 3"))!;
    const bank = tasks!.find((t) => t.title.toLowerCase().includes("bank"))!;
    expect(chapter.list_id).toBe(listId);
    expect(bank.list_id).toBeNull(); // Miscellaneous
    expect(bank.priority).toBe("Medium");
    expect(bank.due_at).toBeNull(); // Tasks keep no due date when none is given
  });

  test("modify (move + rename), mark done, and delete a card", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const listId = await createTodoList(admin, user.userId, { name: "Errands" });
    const moveId = await createTask(admin, user.userId, { title: "Pick up parcel" });
    const doneId = await createTask(admin, user.userId, { title: "Water plants" });
    const deleteId = await createTask(admin, user.userId, { title: "Old chore" });
    await openAssistant(page);

    await runMutation(page, "Move my Pick up parcel task to my Errands list");
    expect((await admin.from("tasks").select("list_id").eq("id", moveId).single()).data?.list_id).toBe(listId);

    await runMutation(page, "Rename my Pick up parcel task to Collect parcel");
    expect((await admin.from("tasks").select("title").eq("id", moveId).single()).data?.title.toLowerCase()).toContain("collect parcel");

    await runMutation(page, "Mark my Water plants task as done");
    expect((await admin.from("tasks").select("status").eq("id", doneId).single()).data?.status).toBe("Done");

    await runMutation(page, "Delete my Old chore task");
    expect((await admin.from("tasks").select("deleted_at").eq("id", deleteId).single()).data?.deleted_at).not.toBeNull();
  });
});
