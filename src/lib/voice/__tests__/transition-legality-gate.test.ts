import { describe, expect, it } from "vitest";
import { getValidDeadlineEvents } from "@/lib/api/transitions";
import { mutationDraftSchema, type EntityContext, type RawMutation } from "@/lib/voice/intent";
import { gateTransitionLegality } from "@/lib/voice/transition-legality-gate";

const DEADLINE_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";

function contextDeadline(
  overrides: Partial<EntityContext["deadlines"][number]> & { id: string },
): EntityContext["deadlines"][number] {
  const status = overrides.status ?? "Not Started";
  return {
    title: "Homework 5",
    course_id: "course-1",
    due_at: "2026-09-27T22:00:00.000Z",
    recurring: false,
    ...overrides,
    status,
    validEvents: overrides.validEvents ?? getValidDeadlineEvents(status),
  };
}

function emptyContext(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    courses: [],
    deadlines: [],
    tasks: [],
    todoLists: [],
    sessions: [],
    appointments: [],
    knowledgeSources: [],
    people: [],
    ...overrides,
  };
}

function deadlineTransition(event: string, targetId: string | null = DEADLINE_ID): RawMutation {
  return mutationDraftSchema.parse({
    target_type: "deadline",
    operation: "transition",
    target_id: targetId,
    course_id: null,
    title: null,
    due_at: null,
    priority: null,
    event,
  });
}

describe("gateTransitionLegality", () => {
  it("asks instead of proposing user_confirms_done on a Not Started deadline", () => {
    const raw = deadlineTransition("user_confirms_done");
    const result = gateTransitionLegality(raw, emptyContext({ deadlines: [contextDeadline({ id: DEADLINE_ID })] }));
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") {
      expect(result.question).toMatch(/Homework 5 is currently Not Started/);
      expect(result.question).toMatch(/mark it in progress/);
      expect(result.mutation).toEqual(raw);
    }
  });

  it("proceeds when the event is legal from the current status", () => {
    const raw = deadlineTransition("user_marks_in_progress");
    expect(gateTransitionLegality(raw, emptyContext({ deadlines: [contextDeadline({ id: DEADLINE_ID })] }))).toEqual({
      kind: "proceed",
      mutation: raw,
    });
  });

  it("proceeds when the target row is not in the entity context", () => {
    const raw = deadlineTransition("user_confirms_done");
    expect(gateTransitionLegality(raw, emptyContext())).toEqual({ kind: "proceed", mutation: raw });
  });

  it("says there is nothing left to change when validEvents is empty", () => {
    const raw = deadlineTransition("user_cancels");
    const result = gateTransitionLegality(
      raw,
      emptyContext({
        deadlines: [contextDeadline({ id: DEADLINE_ID, status: "Completed", title: "Final Project" })],
      }),
    );
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") {
      expect(result.question).toMatch(/Final Project is already Completed/);
      expect(result.question).toMatch(/nothing left to change/);
    }
  });

  it("ignores a non-transition mutation", () => {
    const raw = mutationDraftSchema.parse({
      target_type: "task",
      operation: "create",
      target_id: null,
      title: "Buy milk",
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
    });
    expect(gateTransitionLegality(raw, emptyContext({ tasks: [] }))).toEqual({ kind: "proceed", mutation: raw });
  });

  it("asks on an illegal task transition too", () => {
    const raw = mutationDraftSchema.parse({
      target_type: "task",
      operation: "transition",
      target_id: TASK_ID,
      title: null,
      due_at: null,
      reminder_lead_minutes: null,
      priority: null,
      event: "user_marks_done",
    });
    const result = gateTransitionLegality(
      raw,
      emptyContext({
        tasks: [{ id: TASK_ID, title: "Call the bank", list_id: null, status: "Done", validEvents: [] }],
      }),
    );
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") {
      expect(result.question).toMatch(/Call the bank is already Done/);
    }
  });
});
