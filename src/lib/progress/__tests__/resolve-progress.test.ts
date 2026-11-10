import { describe, expect, it } from "vitest";
import { resolveDeadlineProgress, resolveSessionProgress, resolveTaskProgress, toAutoProgress } from "../resolve-progress";
import { makeAppointment, makeDeadline, makeTask } from "@/lib/dashboard/__tests__/fixtures";

describe("resolveDeadlineProgress", () => {
  const deadline = makeDeadline({ id: "d-1" });
  const session = (overrides: Parameters<typeof makeAppointment>[0]) => makeAppointment({ deadline_id: "d-1", ...overrides });

  it("has no progress when nothing is set and there are no sessions", () => {
    expect(resolveDeadlineProgress(deadline, [])).toEqual({ percent: null, source: "none", note: null });
  });

  it("uses the hand-set percent over everything else", () => {
    const withManual = makeDeadline({ id: "d-1", progress_percent: 35, estimated_hours: 10, progress_note: "outline done" });
    const sessions = [session({ id: "a", session_status: "done", duration_minutes: 600 })];
    expect(resolveDeadlineProgress(withManual, sessions)).toEqual({ percent: 35, source: "manual", note: "outline done" });
  });

  it("respects a deliberate 0 percent instead of treating it as unset", () => {
    const zero = makeDeadline({ id: "d-1", progress_percent: 0 });
    const sessions = [session({ id: "a", session_status: "done", duration_minutes: 60 })];
    expect(resolveDeadlineProgress(zero, sessions).percent).toBe(0);
    expect(resolveDeadlineProgress(zero, sessions).source).toBe("manual");
  });

  it("is 100 when the deadline is completed, even with no sessions", () => {
    const completed = makeDeadline({ id: "d-1", status: "Completed" });
    expect(resolveDeadlineProgress(completed, [])).toEqual({ percent: 100, source: "status", note: null });
  });

  it("with an estimate, divides done session minutes by the estimate", () => {
    const estimated = makeDeadline({ id: "d-1", estimated_hours: 4 });
    const sessions = [
      session({ id: "a", session_status: "done", duration_minutes: 60 }),
      session({ id: "b", session_status: "done", duration_minutes: 60 }),
      session({ id: "c", session_status: "planned", duration_minutes: 120 }),
    ];
    expect(resolveDeadlineProgress(estimated, sessions)).toEqual({ percent: 50, source: "session-time", note: null });
  });

  it("with an estimate and no done sessions, is 0 rather than unknown", () => {
    const estimated = makeDeadline({ id: "d-1", estimated_hours: 4 });
    expect(resolveDeadlineProgress(estimated, [])).toEqual({ percent: 0, source: "session-time", note: null });
  });

  it("caps session-time progress at 100 when more is logged than estimated", () => {
    const estimated = makeDeadline({ id: "d-1", estimated_hours: 1 });
    const sessions = [session({ id: "a", session_status: "done", duration_minutes: 180 })];
    expect(resolveDeadlineProgress(estimated, sessions).percent).toBe(100);
  });

  it("counts a done session with no duration as zero minutes", () => {
    const estimated = makeDeadline({ id: "d-1", estimated_hours: 2 });
    const sessions = [session({ id: "a", session_status: "done", duration_minutes: null })];
    expect(resolveDeadlineProgress(estimated, sessions).percent).toBe(0);
  });

  it("without an estimate, falls back to done / total sessions (skipped stay in the total)", () => {
    const sessions = [
      session({ id: "a", session_status: "done" }),
      session({ id: "b", session_status: "skipped" }),
      session({ id: "c", session_status: "planned" }),
    ];
    expect(resolveDeadlineProgress(deadline, sessions)).toEqual({ percent: 33, source: "session-count", note: null });
  });

  it("ignores sessions that belong to another deadline", () => {
    const sessions = [makeAppointment({ id: "x", deadline_id: "other", session_status: "done" })];
    expect(resolveDeadlineProgress(deadline, sessions)).toEqual({ percent: null, source: "none", note: null });
  });

  it("returns a trimmed note, or null when it is blank", () => {
    expect(resolveDeadlineProgress(makeDeadline({ id: "d-1", progress_note: "  waiting on data  " }), []).note).toBe("waiting on data");
    expect(resolveDeadlineProgress(makeDeadline({ id: "d-1", progress_note: "   " }), []).note).toBeNull();
  });
});

describe("resolveTaskProgress", () => {
  it("has no progress when nothing is set and there is no checklist", () => {
    expect(resolveTaskProgress(makeTask(), undefined)).toEqual({ percent: null, source: "none", note: null });
    expect(resolveTaskProgress(makeTask(), { done: 0, total: 0 })).toEqual({ percent: null, source: "none", note: null });
  });

  it("uses the hand-set percent over the checklist", () => {
    const task = makeTask({ progress_percent: 70, progress_note: "just QA left" });
    expect(resolveTaskProgress(task, { done: 1, total: 4 })).toEqual({ percent: 70, source: "manual", note: "just QA left" });
  });

  it("derives progress from the checklist", () => {
    expect(resolveTaskProgress(makeTask(), { done: 3, total: 5 })).toEqual({ percent: 60, source: "checklist", note: null });
  });

  it("is 100 when the task is Done, whatever the checklist says", () => {
    expect(resolveTaskProgress(makeTask({ status: "Done" }), { done: 1, total: 4 })).toEqual({ percent: 100, source: "status", note: null });
  });

  it("a hand-set percent still wins on a Done task", () => {
    expect(resolveTaskProgress(makeTask({ status: "Done", progress_percent: 90 }), undefined).percent).toBe(90);
  });
});

describe("resolveSessionProgress", () => {
  it("is 0 while planned, 100 once done, and 0 when skipped", () => {
    expect(resolveSessionProgress(makeAppointment({ session_status: "planned" }))).toEqual({ percent: 0, source: "status", note: null });
    expect(resolveSessionProgress(makeAppointment({ session_status: "done" })).percent).toBe(100);
    expect(resolveSessionProgress(makeAppointment({ session_status: "skipped" })).percent).toBe(0);
  });

  it("uses the hand-set percent for a session part-way through", () => {
    const session = makeAppointment({ session_status: "planned", progress_percent: 50, progress_note: "half the reading" });
    expect(resolveSessionProgress(session)).toEqual({ percent: 50, source: "manual", note: "half the reading" });
  });

  it("has no progress for an appointment that is not a session", () => {
    expect(resolveSessionProgress(makeAppointment({ session_status: null, deadline_id: null }))).toEqual({ percent: null, source: "none", note: null });
  });
});

describe("toAutoProgress", () => {
  it("explains where a derived value came from", () => {
    expect(toAutoProgress({ percent: 60, source: "checklist", note: null })).toEqual({ percent: 60, hint: "From checklist items done" });
    expect(toAutoProgress({ percent: 50, source: "session-time", note: null }).hint).toMatch(/estimate/i);
  });

  it("has no hint when there is nothing to derive from", () => {
    expect(toAutoProgress({ percent: null, source: "none", note: null })).toEqual({ percent: null, hint: undefined });
  });
});
