import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGanttModel, describeGanttRow, type GanttRow } from "../gantt-rows";
import { buildUpcomingItems, type TimeWindowFilter } from "../upcoming-items";
import { makeAppointment, makeDeadline, makeTask } from "./fixtures";

// Local noon on Sat 2026-01-10, so "today" is unambiguous in any time zone the suite runs in.
const NOW = new Date(2026, 0, 10, 12, 0, 0);
// Calendar days, not milliseconds: a 24h step is an hour off across a DST change.
const at = (days: number, hours = 0) => new Date(2026, 0, 10 + days, hours);

// buildUpcomingItems reads the real clock for "overdue", so pin it to NOW.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const iso = (date: Date) => date.toISOString();

function model(
  input: Partial<Parameters<typeof buildGanttModel>[0]> & { window?: TimeWindowFilter } = {},
) {
  const deadlines = input.deadlines ?? [];
  const tasks = input.tasks ?? [];
  const appointments = input.appointments ?? [];
  return buildGanttModel({
    items: input.items ?? buildUpcomingItems({ deadlines, tasks, appointments }),
    deadlines,
    tasks,
    appointments,
    checklist: input.checklist ?? [],
    window: input.window ?? "all",
    now: NOW,
  });
}

describe("buildGanttModel rows", () => {
  it("draws a deadline from its creation to its due date, with resolved progress", () => {
    const deadline = makeDeadline({ id: "d-1", title: "Essay", created_at: iso(at(-4)), due_at: iso(at(3, 12)), progress_percent: 40 });
    const { rows } = model({ deadlines: [deadline] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "deadline:d-1", entityId: "d-1", kind: "deadline", title: "Essay", percent: 40, source: "manual", overdue: false });
    expect(rows[0].start.getTime()).toBe(at(-4).getTime());
    expect(rows[0].end.getTime()).toBe(at(3, 12).getTime());
  });

  it("draws a task from its creation to its due date and derives progress from its checklist", () => {
    const task = makeTask({ id: "t-1", created_at: iso(at(-2)), due_at: iso(at(2)) });
    const { rows } = model({ tasks: [task], checklist: [{ task_id: "t-1", done: 1, total: 4 }] });

    expect(rows[0]).toMatchObject({ id: "task:t-1", kind: "task", percent: 25, source: "checklist" });
    expect(rows[0].start.getTime()).toBe(at(-2).getTime());
  });

  it("draws a session at its own date and time for its duration", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(-3)), due_at: iso(at(5)) });
    const session = makeAppointment({ id: "s-1", deadline_id: "d-1", date: "2026-01-11", time: "14:00", duration_minutes: 600, session_status: "planned" });
    const { rows } = model({ deadlines: [deadline], appointments: [session] });

    const row = rows.find((r) => r.kind === "session")!;
    expect(row.start.getTime()).toBe(new Date(2026, 0, 11, 14).getTime());
    expect(row.end.getTime()).toBe(new Date(2026, 0, 12, 0).getTime());
    expect(row).toMatchObject({ percent: 0, source: "status" });
  });

  it("draws a very short session at a minimum visible width, not as an invisible sliver", () => {
    const session = makeAppointment({ id: "s-1", deadline_id: "d-1", date: "2026-01-11", time: "09:00", duration_minutes: 30, session_status: "planned" });
    const { rows } = model({ deadlines: [makeDeadline({ id: "d-1", created_at: iso(at(-1)), due_at: iso(at(4)) })], appointments: [session] });

    const row = rows.find((r) => r.kind === "session")!;
    expect(row.end.getTime() - row.start.getTime()).toBeGreaterThanOrEqual(6 * 3_600_000);
  });

  it("gives a session with no duration a default length", () => {
    const session = makeAppointment({ id: "s-1", deadline_id: "d-1", date: "2026-01-11", time: "09:00", duration_minutes: null, session_status: "planned" });
    const { rows } = model({ deadlines: [makeDeadline({ id: "d-1", created_at: iso(at(-1)), due_at: iso(at(4)) })], appointments: [session] });
    const row = rows.find((r) => r.kind === "session")!;
    expect(row.end.getTime()).toBeGreaterThan(row.start.getTime());
  });

  it("leaves out events, reminders and anything that is not a deadline, task or session", () => {
    const event = makeAppointment({ id: "e-1", category: "Personal", deadline_id: null, session_status: null, event_status: "planned", date: "2026-01-11", time: "10:00" });
    const task = makeTask({ id: "t-1", created_at: iso(at(-1)), due_at: iso(at(2)) });
    const { rows } = model({ tasks: [task], appointments: [event] });
    expect(rows.map((r) => r.id)).toEqual(["task:t-1"]);
  });

  it("lets an overdue bar run to now and flags it, since the work is late and still open", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(-6)), due_at: iso(at(-2)), status: "Overdue" });
    const { rows } = model({ deadlines: [deadline] });

    expect(rows[0].overdue).toBe(true);
    expect(rows[0].end.getTime()).toBe(NOW.getTime());
  });

  it("does not flag an item due later today as overdue", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(-1)), due_at: iso(at(0, 20)) });
    expect(model({ deadlines: [deadline] }).rows[0].overdue).toBe(false);
  });

  it("gives a deadline created after it is due (or at the same instant) a minimum width", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(1)), due_at: iso(at(1)) });
    const row = model({ deadlines: [deadline] }).rows[0];
    expect(row.end.getTime()).toBeGreaterThan(row.start.getTime());
  });

  it("clips a bar that began before the visible range and remembers the true start", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(-40)), due_at: iso(at(2)) });
    const { rows, rangeStart } = model({ deadlines: [deadline], window: "today" });

    expect(rows[0].clippedStart).toBe(true);
    expect(rows[0].start.getTime()).toBe(rangeStart.getTime());
    expect(rows[0].actualStart.getTime()).toBe(at(-40).getTime());
  });

  it("does not clip a bar that starts inside the range", () => {
    const deadline = makeDeadline({ id: "d-1", created_at: iso(at(-1)), due_at: iso(at(2)) });
    const row = model({ deadlines: [deadline], window: "7days" }).rows[0];
    expect(row.clippedStart).toBe(false);
    expect(row.start.getTime()).toBe(row.actualStart.getTime());
  });

  it("lists a session straight after its deadline, then the rest by due date", () => {
    const d1 = makeDeadline({ id: "d-1", title: "Paper", created_at: iso(at(-3)), due_at: iso(at(5)) });
    const d2 = makeDeadline({ id: "d-2", title: "Quiz", created_at: iso(at(-3)), due_at: iso(at(6)) });
    const task = makeTask({ id: "t-1", created_at: iso(at(-3)), due_at: iso(at(1)) });
    const session = makeAppointment({ id: "s-1", deadline_id: "d-1", date: "2026-01-12", time: "10:00", duration_minutes: 60, session_status: "planned" });
    const { rows } = model({ deadlines: [d2, d1], tasks: [task], appointments: [session] });

    expect(rows.map((r) => r.id)).toEqual(["task:t-1", "deadline:d-1", "session:s-1", "deadline:d-2"]);
    expect(rows.find((r) => r.kind === "session")!.parentId).toBe("deadline:d-1");
  });

  it("keeps a session top-level when its deadline is not shown", () => {
    const session = makeAppointment({ id: "s-1", deadline_id: "gone", date: "2026-01-12", time: "10:00", duration_minutes: 60, session_status: "planned" });
    const { rows } = model({ appointments: [session] });
    expect(rows).toHaveLength(1);
    expect(rows[0].parentId).toBeUndefined();
  });

  it("skips an item whose underlying row is missing instead of throwing", () => {
    const task = makeTask({ id: "t-1", created_at: iso(at(-1)), due_at: iso(at(2)) });
    const items = buildUpcomingItems({ deadlines: [], tasks: [task] });
    expect(() => model({ items, tasks: [] })).not.toThrow();
    expect(model({ items, tasks: [] }).rows).toEqual([]);
  });
});

describe("buildGanttModel range and scale", () => {
  const dueIn = (days: number) => makeDeadline({ id: `d-${days}`, created_at: iso(at(-1)), due_at: iso(at(days, 12)) });

  it.each([
    ["today", 0],
    ["tomorrow", 1],
    ["3days", 2],
    ["7days", 6],
  ] as const)("the %s window ends two days after its last day", (window, lastDay) => {
    const { rangeEnd } = model({ deadlines: [dueIn(lastDay)], window });
    expect(rangeEnd.getTime()).toBe(at(lastDay + 2).getTime());
  });

  it("starts at least one day before today, and never later than the earliest bar inside the lookback", () => {
    const { rangeStart } = model({ deadlines: [dueIn(1)], window: "today" });
    expect(rangeStart.getTime()).toBeLessThanOrEqual(at(-1).getTime());
    expect(rangeStart.getHours()).toBe(0);
  });

  it("looks back further for a wider window but caps how far (a week)", () => {
    const old = makeDeadline({ id: "d-old", created_at: iso(at(-100)), due_at: iso(at(2)) });
    const wide = model({ deadlines: [old], window: "all" });
    const narrow = model({ deadlines: [old], window: "today" });
    expect(wide.rangeStart.getTime()).toBe(at(-7).getTime());
    expect(narrow.rangeStart.getTime()).toBeGreaterThan(wide.rangeStart.getTime());
  });

  it("uses day columns for a short window and week columns for a long one", () => {
    expect(model({ deadlines: [dueIn(2)], window: "7days" }).unit).toBe("day");
    expect(model({ deadlines: [dueIn(55)], window: "all" }).unit).toBe("week");
  });

  it("'all' reaches the latest due date, at least a week ahead, at most 60 days", () => {
    expect(model({ deadlines: [dueIn(2)], window: "all" }).rangeEnd.getTime()).toBe(at(6 + 2).getTime());
    expect(model({ deadlines: [dueIn(30)], window: "all" }).rangeEnd.getTime()).toBe(at(30 + 2).getTime());
    expect(model({ deadlines: [dueIn(200)], window: "all" }).rangeEnd.getTime()).toBe(at(59 + 2).getTime());
  });

  it("still returns a sensible range and no rows when there is nothing to show", () => {
    const { rows, rangeStart, rangeEnd } = model({ window: "7days" });
    expect(rows).toEqual([]);
    expect(rangeEnd.getTime()).toBeGreaterThan(rangeStart.getTime());
  });
});

describe("describeGanttRow", () => {
  const row = (overrides: Partial<GanttRow> = {}): GanttRow => ({
    id: "deadline:d-1",
    entityId: "d-1",
    kind: "deadline",
    title: "Essay",
    start: at(-2),
    end: at(3),
    actualStart: at(-2),
    clippedStart: false,
    percent: 40,
    source: "manual",
    note: null,
    overdue: false,
    ...overrides,
  });

  it("names the item, its kind, its progress and where that came from", () => {
    const text = describeGanttRow(row());
    expect(text).toContain("Essay");
    expect(text).toContain("Deadline");
    expect(text).toContain("40%");
    expect(text).toMatch(/set by you/i);
  });

  it("says when progress is unknown", () => {
    expect(describeGanttRow(row({ percent: null, source: "none" }))).toMatch(/no progress/i);
  });

  it("flags overdue items and includes the note", () => {
    const text = describeGanttRow(row({ overdue: true, note: "waiting on data" }));
    expect(text).toMatch(/overdue/i);
    expect(text).toContain("waiting on data");
  });

  it("labels each kind", () => {
    expect(describeGanttRow(row({ kind: "task" }))).toContain("Task");
    expect(describeGanttRow(row({ kind: "session" }))).toContain("Session");
  });

  it("reports the real start when the bar is clipped", () => {
    const clipped = row({ clippedStart: true, start: at(-3), actualStart: at(-40) });
    const unclipped = row();
    expect(describeGanttRow(clipped)).not.toBe(describeGanttRow(unclipped));
  });
});
