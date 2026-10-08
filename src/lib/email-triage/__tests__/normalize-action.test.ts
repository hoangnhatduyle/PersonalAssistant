import { describe, expect, it } from "vitest";
import { normalizeSuggestedAction } from "@/lib/email-triage/normalize-action";
import type { RawSuggestedAction } from "@/lib/email-triage/stage2";

const COURSE = "7d0c9d3e-4f5a-4b7c-8a1e-2b3c4d5e6f70";
const context = { now: new Date("2026-10-11T16:00:00Z"), today: "2026-10-11", courseIds: new Set([COURSE]) };
const FUTURE = "2026-10-16T17:00:00-04:00";

function raw(overrides: Partial<RawSuggestedAction>): RawSuggestedAction {
  return { kind: "task", title: "Do the thing", ...overrides };
}

describe("normalizeSuggestedAction", () => {
  it("returns null for no action or an empty title", () => {
    expect(normalizeSuggestedAction(null, context)).toBeNull();
    expect(normalizeSuggestedAction(raw({ title: "   " }), context)).toBeNull();
  });

  it("keeps a task with a future due date", () => {
    expect(normalizeSuggestedAction(raw({ due_at: FUTURE }), context)).toEqual({
      kind: "task",
      title: "Do the thing",
      due_at: "2026-10-16T21:00:00.000Z",
    });
  });

  it("drops a past or unparsable due_at but keeps the action", () => {
    expect(normalizeSuggestedAction(raw({ due_at: "2026-10-01T00:00:00Z" }), context)).toEqual({ kind: "task", title: "Do the thing" });
    expect(normalizeSuggestedAction(raw({ due_at: "next friday" }), context)).toEqual({ kind: "task", title: "Do the thing" });
  });

  it("turns a reminder into a task with a reminder, or a plain task without a time", () => {
    expect(normalizeSuggestedAction(raw({ kind: "reminder", due_at: FUTURE }), context)).toMatchObject({
      kind: "task",
      reminders_enabled: true,
    });
    expect(normalizeSuggestedAction(raw({ kind: "reminder" }), context)).toEqual({ kind: "task", title: "Do the thing" });
  });

  it("keeps a deadline only with a due date and a course the user owns", () => {
    expect(normalizeSuggestedAction(raw({ kind: "deadline", due_at: FUTURE, course_id: COURSE }), context)).toMatchObject({
      kind: "deadline",
      course_id: COURSE,
    });
  });

  it("downgrades a deadline to a task for an unknown course (a model-invented id) or a missing date", () => {
    const unknownCourse = normalizeSuggestedAction(
      raw({ kind: "deadline", due_at: FUTURE, course_id: "11111111-1111-4111-8111-111111111111" }),
      context,
    );
    expect(unknownCourse).toMatchObject({ kind: "task" });
    expect(unknownCourse).not.toHaveProperty("course_id");
    expect(normalizeSuggestedAction(raw({ kind: "deadline", course_id: COURSE }), context)).toEqual({ kind: "task", title: "Do the thing" });
  });

  it("keeps an event with a non-past date, time and a valid duration", () => {
    expect(
      normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-14", time: "15:30", duration_minutes: 45 }), context),
    ).toEqual({ kind: "event", title: "Do the thing", date: "2026-10-14", time: "15:30", duration_minutes: 45 });
  });

  it("downgrades an event missing time or duration, or dated in the past, to a task", () => {
    expect(normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-14", time: "15:30" }), context)).toMatchObject({ kind: "task" });
    expect(normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-14", duration_minutes: 30 }), context)).toMatchObject({ kind: "task" });
    expect(
      normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-01", time: "09:00", duration_minutes: 30 }), context),
    ).toMatchObject({ kind: "task" });
    expect(
      normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-14", time: "9am", duration_minutes: 30 }), context),
    ).toMatchObject({ kind: "task" });
    expect(
      normalizeSuggestedAction(raw({ kind: "event", date: "2026-10-14", time: "09:00", duration_minutes: 5000 }), context),
    ).toMatchObject({ kind: "task" });
  });

  it("caps an over-long title", () => {
    const action = normalizeSuggestedAction(raw({ title: "t".repeat(400) }), context);
    expect(action?.title).toHaveLength(120);
  });
});
