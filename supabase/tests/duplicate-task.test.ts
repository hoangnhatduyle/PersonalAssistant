import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createTask } from "./helpers";
import type { TestUser } from "./helpers";

// Board "Duplicate as new": copies a (typically Done) card into a fresh Open
// card, dropping every completion detail.
describe("duplicate_task", () => {
  const admin = adminClient();
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
  });

  async function makeDoneTask(overrides: Record<string, unknown> = {}): Promise<string> {
    const id = await createTask(admin, user.userId, {
      title: "Read Paper A",
      priority: "High",
      tags: ["reading"],
      due_at: "2026-09-29T12:00:00Z",
      reminders_enabled: true,
      reminder_lead_minutes: 30,
      ...overrides,
    });
    const { error } = await admin.from("tasks").update({ status: "Done" }).eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }

  async function duplicate(sourceId: string) {
    const { data, error } = await user.client.rpc("duplicate_task", { p_task_id: sourceId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  it("creates an Open copy with no completion details and no due date", async () => {
    const sourceId = await makeDoneTask();
    const copyId = await duplicate(sourceId);

    const { data: copy } = await admin.from("tasks").select("*").eq("id", copyId).single();
    expect(copyId).not.toBe(sourceId);
    expect(copy).toMatchObject({
      title: "Read Paper A",
      status: "Open",
      priority: "High",
      tags: ["reading"],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
      due_at: null,
      completed_at: null,
      acknowledged_at: null,
      deleted_at: null,
    });
  });

  it("leaves the original card's Done status and completed_at untouched", async () => {
    const sourceId = await makeDoneTask();
    const { data: before } = await admin.from("tasks").select("status, completed_at").eq("id", sourceId).single();
    await duplicate(sourceId);
    const { data: after } = await admin.from("tasks").select("status, completed_at").eq("id", sourceId).single();
    expect(after).toEqual(before);
    expect(after?.completed_at).not.toBeNull();
  });

  it("copies checklist items unchecked and skips soft-deleted ones", async () => {
    const sourceId = await makeDoneTask();
    await admin.from("checklist_items").insert([
      { user_id: user.userId, task_id: sourceId, label: "Skim", is_done: true, position: 0 },
      { user_id: user.userId, task_id: sourceId, label: "Annotate", is_done: true, position: 1 },
      { user_id: user.userId, task_id: sourceId, label: "Gone", is_done: false, position: 2, deleted_at: new Date().toISOString() },
    ]);

    const copyId = await duplicate(sourceId);
    const { data: items } = await admin
      .from("checklist_items")
      .select("label, is_done, position")
      .eq("task_id", copyId)
      .order("position");
    expect(items).toEqual([
      { label: "Skim", is_done: false, position: 0 },
      { label: "Annotate", is_done: false, position: 1 },
    ]);
  });

  it("copies link attachments only, not uploaded files", async () => {
    const sourceId = await makeDoneTask();
    await admin.from("task_attachments").insert([
      { user_id: user.userId, task_id: sourceId, kind: "link", title: "Paper", url: "https://example.com/a" },
      { user_id: user.userId, task_id: sourceId, kind: "file", title: "Scan", storage_object_path: "u/scan.pdf" },
      { user_id: user.userId, task_id: sourceId, kind: "link", title: "Old", url: "https://example.com/old", deleted_at: new Date().toISOString() },
    ]);

    const copyId = await duplicate(sourceId);
    const { data: attachments } = await admin
      .from("task_attachments")
      .select("kind, title, url, storage_object_path")
      .eq("task_id", copyId);
    expect(attachments).toEqual([
      { kind: "link", title: "Paper", url: "https://example.com/a", storage_object_path: null },
    ]);
  });

  it("copies live labels and skips soft-deleted ones", async () => {
    const sourceId = await makeDoneTask();
    const { data: labels, error: labelsError } = await admin
      .from("labels")
      .insert([
        { user_id: user.userId, name: "Keep", color: "green" },
        { user_id: user.userId, name: "Dead", color: "orange" },
      ])
      .select("id, name");
    expect(labelsError).toBeNull();
    const { error: linkError } = await admin.from("task_labels").insert(
      (labels ?? []).map((label) => ({ task_id: sourceId, label_id: label.id, user_id: user.userId })),
    );
    expect(linkError).toBeNull();
    // Soft-delete after linking: guard_task_label_ownership rejects linking an already-dead label.
    const deadId = labels?.find((label) => label.name === "Dead")?.id;
    await admin.from("labels").update({ deleted_at: new Date().toISOString() }).eq("id", deadId!);

    const copyId = await duplicate(sourceId);
    const { data: copied } = await admin.from("task_labels").select("label_id").eq("task_id", copyId);
    const keepId = labels?.find((label) => label.name === "Keep")?.id;
    expect(copied).toEqual([{ label_id: keepId }]);
  });

  it("places the copy above every existing card in the same list", async () => {
    const { data: list } = await admin
      .from("todo_lists")
      .insert({ user_id: user.userId, name: "Reading" })
      .select("id")
      .single();
    const first = await createTask(admin, user.userId, { list_id: list!.id, position: 0 });
    const sourceId = await makeDoneTask({ list_id: list!.id, position: 3 });

    const copyId = await duplicate(sourceId);
    const { data: copy } = await admin.from("tasks").select("list_id, position").eq("id", copyId).single();
    const { data: firstRow } = await admin.from("tasks").select("position").eq("id", first).single();
    expect(copy?.list_id).toBe(list!.id);
    expect(copy!.position).toBeLessThan(firstRow!.position);
  });

  it("rejects a task that does not exist or belongs to another user", async () => {
    const other = await createAuthenticatedUser();
    const foreignId = await createTask(admin, other.userId);
    const { error } = await user.client.rpc("duplicate_task", { p_task_id: foreignId });
    expect(error).not.toBeNull();
  });
});
