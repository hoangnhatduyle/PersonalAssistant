import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createTask } from "./helpers";
import type { TestUser } from "./helpers";

// Long-term tasks (0056_long_term_tasks.sql): is_long_term and due_at are
// mutually exclusive, resolved by normalize_task_long_term (last-touched field
// wins) with a CHECK constraint as the backstop for an INSERT carrying both.
describe("long-term tasks", () => {
  const admin = adminClient();
  let user: TestUser;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
  });

  async function read(id: string) {
    const { data, error } = await admin.from("tasks").select("is_long_term, due_at, updated_at").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }

  it("defaults to false", async () => {
    const id = await createTask(admin, user.userId);
    expect((await read(id)).is_long_term).toBe(false);
  });

  it("clears due_at when is_long_term is switched on", async () => {
    const id = await createTask(admin, user.userId, { due_at: "2026-09-29T12:00:00Z" });
    const { error } = await admin.from("tasks").update({ is_long_term: true }).eq("id", id);
    expect(error).toBeNull();
    expect(await read(id)).toMatchObject({ is_long_term: true, due_at: null });
  });

  it("turns is_long_term off when a due_at is set afterwards", async () => {
    const id = await createTask(admin, user.userId, { is_long_term: true });
    const { error } = await admin.from("tasks").update({ due_at: "2026-09-29T12:00:00Z" }).eq("id", id);
    expect(error).toBeNull();
    expect(await read(id)).toMatchObject({ is_long_term: false });
    expect((await read(id)).due_at).not.toBeNull();
  });

  it("accepts the form's single update of is_long_term: true with due_at: null", async () => {
    const id = await createTask(admin, user.userId, { due_at: "2026-09-29T12:00:00Z" });
    const { error } = await admin.from("tasks").update({ is_long_term: true, due_at: null }).eq("id", id);
    expect(error).toBeNull();
    expect(await read(id)).toMatchObject({ is_long_term: true, due_at: null });
  });

  it("rejects an INSERT that sets both is_long_term and due_at", async () => {
    const { error } = await admin
      .from("tasks")
      .insert({ user_id: user.userId, title: "Both", is_long_term: true, due_at: "2026-09-29T12:00:00Z" });
    expect(error?.message).toMatch(/tasks_long_term_has_no_due_at/);
  });

  it("counts toggling the flag as a touch (bumps updated_at)", async () => {
    const id = await createTask(admin, user.userId);
    const before = (await read(id)).updated_at;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await admin.from("tasks").update({ is_long_term: true }).eq("id", id);
    expect((await read(id)).updated_at).not.toBe(before);
  });

  it("is exposed through the active_tasks view", async () => {
    const id = await createTask(admin, user.userId, { is_long_term: true });
    const { data, error } = await user.client.from("active_tasks").select("is_long_term").eq("id", id).single();
    expect(error).toBeNull();
    expect(data?.is_long_term).toBe(true);
  });

  it("carries is_long_term onto a duplicated card", async () => {
    const id = await createTask(admin, user.userId, { is_long_term: true });
    await admin.from("tasks").update({ status: "Done" }).eq("id", id);
    const { data: copyId, error } = await user.client.rpc("duplicate_task", { p_task_id: id });
    expect(error).toBeNull();
    expect(await read(copyId as string)).toMatchObject({ is_long_term: true, due_at: null });
  });
});
