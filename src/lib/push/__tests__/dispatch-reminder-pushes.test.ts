import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { dispatchReminderPushes } from "../dispatch-reminder-pushes";
import type { PushSendResult } from "../send-push";

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of the Supabase query builder the dispatcher
 * uses: select / update / delete with eq / is / in filters, plus the
 * `.update().eq().is().select().maybeSingle()` claim. Not a general fake -- it
 * implements exactly what dispatch-reminder-pushes.ts calls.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "update" | "delete" = "select";
  private patch: Row = {};
  private returnRows = false;
  private single = false;

  constructor(private readonly table: Row[]) {}

  select() {
    if (this.op === "update") this.returnRows = true;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  then<R1, R2>(onfulfilled?: (value: { data: unknown; error: null }) => R1 | PromiseLike<R1>, onrejected?: (reason: unknown) => R2 | PromiseLike<R2>) {
    const matched = this.table.filter((row) => this.filters.every((filter) => filter(row)));
    let data: unknown = null;
    if (this.op === "select") {
      data = matched.map((row) => ({ ...row }));
    } else if (this.op === "update") {
      matched.forEach((row) => Object.assign(row, this.patch));
      data = this.returnRows ? matched.map((row) => ({ ...row })) : null;
    } else {
      for (const row of matched) this.table.splice(this.table.indexOf(row), 1);
    }
    if (this.single) data = (data as Row[])[0] ?? null;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

interface World {
  reminders: Row[];
  push_subscriptions: Row[];
  tasks: Row[];
  deadlines: Row[];
  courses: Row[];
}

function world(overrides: Partial<World> = {}): World {
  return {
    reminders: [],
    push_subscriptions: [],
    tasks: [],
    deadlines: [],
    courses: [],
    ...overrides,
  };
}

const client = (w: World) => ({ from: (name: keyof World) => new FakeQuery(w[name]) }) as unknown as SupabaseClient<Database>;

const NOW = new Date("2026-11-03T12:00:00.000Z");
const reminder = (id: string, overrides: Row = {}): Row => ({
  id,
  user_id: "u-1",
  target_type: "task",
  target_id: `t-${id}`,
  acknowledgment_state: "Delivered",
  pushed_at: null,
  ...overrides,
});
const task = (reminderId: string, overrides: Row = {}): Row => ({ id: `t-${reminderId}`, title: `Task ${reminderId}`, due_at: "2026-11-03T15:00:00.000Z", deleted_at: null, ...overrides });
const sub = (id: string, overrides: Row = {}): Row => ({ id, user_id: "u-1", endpoint: `https://push.example.com/${id}`, p256dh: "k", auth: "a", ...overrides });

const sent: PushSendResult = { status: "sent" };
const gone: PushSendResult = { status: "gone" };
const failed: PushSendResult = { status: "failed", reason: "push service responded 503" };

const run = (w: World, send: (endpoint: string) => PushSendResult | Promise<PushSendResult>) => {
  const spy = vi.fn(async (...[s]: [{ endpoint: string }, unknown]) => send(s.endpoint));
  return { spy, promise: dispatchReminderPushes(client(w), { send: spy as never, now: () => NOW }) };
};

describe("dispatchReminderPushes", () => {
  it("does nothing when there are no candidates", async () => {
    const { spy, promise } = run(world(), () => sent);
    await expect(promise).resolves.toEqual({ sent: 0, skipped: 0, failed: 0, noSubscription: 0, subscriptionsRemoved: 0 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("only considers Delivered reminders that have not been pushed", async () => {
    const w = world({
      reminders: [reminder("r1", { acknowledgment_state: "Scheduled" }), reminder("r2", { pushed_at: "2026-11-03T11:00:00.000Z" }), reminder("r3", { acknowledgment_state: "Expired" })],
      push_subscriptions: [sub("s1")],
      tasks: [task("r1"), task("r2"), task("r3")],
    });
    const { spy, promise } = run(w, () => sent);
    expect((await promise).sent).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves a reminder unclaimed when its owner has no subscription, so a later subscriber still gets it", async () => {
    const w = world({ reminders: [reminder("r1")], tasks: [task("r1")] });
    const { spy, promise } = run(w, () => sent);
    await expect(promise).resolves.toMatchObject({ sent: 0, noSubscription: 1 });
    expect(spy).not.toHaveBeenCalled();
    expect(w.reminders[0].pushed_at).toBeNull();
  });

  it("claims, pushes the deep link to the owner's device, and keeps the claim", async () => {
    const w = world({ reminders: [reminder("r1")], push_subscriptions: [sub("s1")], tasks: [task("r1")] });
    const { spy, promise } = run(w, () => sent);
    await expect(promise).resolves.toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ endpoint: "https://push.example.com/s1" });
    expect(spy.mock.calls[0][1]).toMatchObject({ title: "Task r1", url: "/board/t-r1", tag: "reminder-r1", body: "Task · due in 3h" });
    expect(w.reminders[0].pushed_at).toBe(NOW.toISOString());
  });

  it("names the course on a deadline reminder", async () => {
    const w = world({
      reminders: [reminder("r1", { target_type: "deadline", target_id: "d-1" })],
      push_subscriptions: [sub("s1")],
      deadlines: [{ id: "d-1", title: "Homework 5", due_at: "2026-11-03T12:30:00.000Z", deleted_at: null, course_id: "c-1" }],
      courses: [{ id: "c-1", name: "Algorithms" }],
    });
    const { spy, promise } = run(w, () => sent);
    await promise;
    expect(spy.mock.calls[0][1]).toMatchObject({ body: "Algorithms · deadline · due in 30m", url: "/courses/deadlines/d-1" });
  });

  it("skips, keeping the claim, when the target was deleted or has no due date", async () => {
    const w = world({
      reminders: [reminder("r1"), reminder("r2"), reminder("r3")],
      push_subscriptions: [sub("s1")],
      tasks: [task("r1", { deleted_at: "2026-11-02T00:00:00.000Z" }), task("r2", { due_at: null })],
      // r3's target does not exist at all
    });
    const { spy, promise } = run(w, () => sent);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 3, failed: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(w.reminders.every((r) => r.pushed_at === NOW.toISOString())).toBe(true);
  });

  it("reverts the claim when every attempt failed transiently, so the next tick retries", async () => {
    const w = world({ reminders: [reminder("r1")], push_subscriptions: [sub("s1"), sub("s2")], tasks: [task("r1")] });
    const { promise } = run(w, () => failed);
    await expect(promise).resolves.toMatchObject({ sent: 0, failed: 1, skipped: 0 });
    expect(w.reminders[0].pushed_at).toBeNull();
    expect(w.push_subscriptions).toHaveLength(2);
  });

  it("deletes a dead subscription and, with no other device, keeps the claim rather than retrying forever", async () => {
    const w = world({ reminders: [reminder("r1")], push_subscriptions: [sub("s1")], tasks: [task("r1")] });
    const { promise } = run(w, () => gone);
    await expect(promise).resolves.toMatchObject({ sent: 0, skipped: 1, failed: 0, subscriptionsRemoved: 1 });
    expect(w.push_subscriptions).toHaveLength(0);
    expect(w.reminders[0].pushed_at).toBe(NOW.toISOString());
  });

  it("delivers to the live device and prunes the dead one", async () => {
    const w = world({ reminders: [reminder("r1")], push_subscriptions: [sub("dead"), sub("live")], tasks: [task("r1")] });
    const { promise } = run(w, (endpoint) => (endpoint.endsWith("/dead") ? gone : sent));
    await expect(promise).resolves.toMatchObject({ sent: 1, subscriptionsRemoved: 1 });
    expect(w.push_subscriptions.map((s) => s.id)).toEqual(["live"]);
  });

  it("keeps the claim when one device got it and another failed transiently (accepted gap)", async () => {
    const w = world({ reminders: [reminder("r1")], push_subscriptions: [sub("ok"), sub("flaky")], tasks: [task("r1")] });
    const { promise } = run(w, (endpoint) => (endpoint.endsWith("/flaky") ? failed : sent));
    await expect(promise).resolves.toMatchObject({ sent: 1, failed: 0 });
    expect(w.reminders[0].pushed_at).toBe(NOW.toISOString());
  });

  it("does not retry an endpoint it just learned is dead for the same user's next reminder", async () => {
    const w = world({
      reminders: [reminder("r1"), reminder("r2")],
      push_subscriptions: [sub("dead")],
      tasks: [task("r1"), task("r2")],
    });
    const { spy, promise } = run(w, () => gone);
    await expect(promise).resolves.toMatchObject({ subscriptionsRemoved: 1 });
    // r2 has no subscription left by the time it is processed: one send total, not two.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("pushes only to the reminder owner's devices", async () => {
    const w = world({
      reminders: [reminder("r1")],
      push_subscriptions: [sub("mine"), sub("theirs", { user_id: "u-2" })],
      tasks: [task("r1")],
    });
    const { spy, promise } = run(w, () => sent);
    await promise;
    expect(spy.mock.calls.map((call) => call[0].endpoint)).toEqual(["https://push.example.com/mine"]);
  });
});
