import { describe, expect, it } from "vitest";
import { mutationDraftSchema, type RawMutation } from "@/lib/voice/intent";
import {
  CANCEL_SCOPE_QUESTION,
  RECURRENCE_DAYS_QUESTION,
  RECURRENCE_QUESTION,
  gateDeadlineRecurrence,
} from "@/lib/voice/deadline-recurrence-gate";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

function deadline(overrides: Record<string, unknown> = {}): RawMutation {
  return mutationDraftSchema.parse({
    target_type: "deadline",
    operation: "create",
    target_id: null,
    course_id: COURSE_ID,
    title: "Weekly quiz",
    due_at: "2026-09-25T22:00:00.000Z",
    priority: null,
    ...overrides,
  });
}

const NO_DEADLINES = { deadlines: [] };
const draftAsking = (question: string, mutation: RawMutation) => ({ mutation, question });

describe("gateDeadlineRecurrence", () => {
  it("asks whether a new deadline should repeat when the user hasn't said (recurring null)", () => {
    const raw = deadline();
    expect(gateDeadlineRecurrence(raw, null, NO_DEADLINES)).toEqual({ kind: "ask", question: RECURRENCE_QUESTION, mutation: raw });
  });

  it("does not ask again once that exact question is open: silence/unclear means one-off (no by default)", () => {
    const raw = deadline();
    const result = gateDeadlineRecurrence(raw, draftAsking(RECURRENCE_QUESTION, raw), NO_DEADLINES);
    expect(result).toEqual({ kind: "proceed", mutation: { ...raw, recurring: false } });
  });

  it("proceeds untouched when the user already said it's one-off", () => {
    const raw = deadline({ recurring: false });
    expect(gateDeadlineRecurrence(raw, null, NO_DEADLINES)).toEqual({ kind: "proceed", mutation: raw });
  });

  it("proceeds untouched when the user already gave days", () => {
    const raw = deadline({ recurring: true, recurrence_days: [1, 3] });
    expect(gateDeadlineRecurrence(raw, null, NO_DEADLINES)).toEqual({ kind: "proceed", mutation: raw });
  });

  it("asks which days when recurring is true but no days were resolved", () => {
    const raw = deadline({ recurring: true, recurrence_days: [] });
    expect(gateDeadlineRecurrence(raw, null, NO_DEADLINES)).toEqual({ kind: "ask", question: RECURRENCE_DAYS_QUESTION, mutation: raw });
  });

  it("falls back to one-off if the days question was already asked and still no days", () => {
    const raw = deadline({ recurring: true, recurrence_days: null });
    const result = gateDeadlineRecurrence(raw, draftAsking(RECURRENCE_DAYS_QUESTION, raw), NO_DEADLINES);
    expect(result).toEqual({ kind: "proceed", mutation: { ...raw, recurring: false, recurrence_days: null } });
  });

  it("never asks on an update, only on a create", () => {
    const update = deadline({ operation: "update", target_id: TARGET_ID });
    expect(gateDeadlineRecurrence(update, null, NO_DEADLINES)).toEqual({ kind: "proceed", mutation: update });
  });

  it("asks on an update only to fill in missing days when the user asked it to repeat", () => {
    const update = deadline({ operation: "update", target_id: TARGET_ID, recurring: true, recurrence_days: [] });
    expect(gateDeadlineRecurrence(update, null, NO_DEADLINES)).toEqual({ kind: "ask", question: RECURRENCE_DAYS_QUESTION, mutation: update });
  });

  it("does not ask while the create is still missing a required field (that failure surfaces on its own)", () => {
    const incomplete = deadline({ title: null });
    expect(gateDeadlineRecurrence(incomplete, null, NO_DEADLINES)).toEqual({ kind: "proceed", mutation: incomplete });
  });

  it("ignores every non-deadline mutation", () => {
    const task = mutationDraftSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy milk",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    expect(gateDeadlineRecurrence(task, null, NO_DEADLINES)).toEqual({ kind: "proceed", mutation: task });
  });

  describe("cancelling a repeating deadline", () => {
    const REPEATING = { id: TARGET_ID, title: "Weekly quiz", course_id: COURSE_ID, due_at: "2026-09-21T22:00:00.000Z", status: "Not Started" as const, recurring: true };
    const ONE_OFF = { ...REPEATING, recurring: false };
    const cancel = (overrides: Record<string, unknown> = {}) =>
      mutationDraftSchema.parse({
        target_type: "deadline",
        operation: "transition",
        target_id: TARGET_ID,
        course_id: null,
        title: null,
        due_at: null,
        priority: null,
        event: "user_cancels",
        ...overrides,
      });

    it("asks whether to cancel just this occurrence or the whole series", () => {
      const raw = cancel();
      expect(gateDeadlineRecurrence(raw, null, { deadlines: [REPEATING] })).toEqual({ kind: "ask", question: CANCEL_SCOPE_QUESTION, mutation: raw });
    });

    it("proceeds untouched once the user chose a scope", () => {
      const raw = cancel({ cancel_scope: "series" });
      expect(gateDeadlineRecurrence(raw, null, { deadlines: [REPEATING] })).toEqual({ kind: "proceed", mutation: raw });
    });

    it("defaults to just this occurrence when the question was already asked and the answer still isn't clear", () => {
      const raw = cancel();
      const result = gateDeadlineRecurrence(raw, draftAsking(CANCEL_SCOPE_QUESTION, raw), { deadlines: [REPEATING] });
      expect(result).toEqual({ kind: "proceed", mutation: { ...raw, cancel_scope: "occurrence" } });
    });

    it("never asks for a one-off deadline or one not in the context", () => {
      const raw = cancel();
      expect(gateDeadlineRecurrence(raw, null, { deadlines: [ONE_OFF] })).toEqual({ kind: "proceed", mutation: raw });
      expect(gateDeadlineRecurrence(raw, null, { deadlines: [] })).toEqual({ kind: "proceed", mutation: raw });
    });

    it("never asks for a transition other than cancel", () => {
      const raw = cancel({ event: "user_marks_in_progress" });
      expect(gateDeadlineRecurrence(raw, null, { deadlines: [REPEATING] })).toEqual({ kind: "proceed", mutation: raw });
    });
  });

  describe("the already-asked guard only applies to the same deadline", () => {
    it("asks again for a different new deadline even though the repeat question is open for another", () => {
      const essay = deadline({ title: "Essay" });
      const lab = deadline({ title: "Lab report" });
      expect(gateDeadlineRecurrence(lab, draftAsking(RECURRENCE_QUESTION, essay), NO_DEADLINES)).toEqual({
        kind: "ask",
        question: RECURRENCE_QUESTION,
        mutation: lab,
      });
    });

    it("treats the same new deadline as the same subject regardless of title casing/spacing", () => {
      const asked = deadline({ title: "Weekly Quiz" });
      const answered = deadline({ title: "  weekly quiz " });
      expect(gateDeadlineRecurrence(answered, draftAsking(RECURRENCE_QUESTION, asked), NO_DEADLINES)).toEqual({
        kind: "proceed",
        mutation: { ...answered, recurring: false },
      });
    });

    it("asks the cancel-scope question again for a different repeating deadline", () => {
      const OTHER_ID = "33333333-3333-4333-8333-333333333333";
      const repeating = (id: string) => ({ id, title: "Quiz", course_id: COURSE_ID, due_at: "2026-09-21T22:00:00.000Z", status: "Not Started" as const, recurring: true });
      const cancel = (id: string) =>
        mutationDraftSchema.parse({ target_type: "deadline", operation: "transition", target_id: id, course_id: null, title: null, due_at: null, priority: null, event: "user_cancels" });
      const result = gateDeadlineRecurrence(cancel(OTHER_ID), draftAsking(CANCEL_SCOPE_QUESTION, cancel(TARGET_ID)), {
        deadlines: [repeating(TARGET_ID), repeating(OTHER_ID)],
      });
      expect(result).toMatchObject({ kind: "ask", question: CANCEL_SCOPE_QUESTION });
    });
  });
});
