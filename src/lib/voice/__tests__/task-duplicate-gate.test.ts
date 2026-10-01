import { describe, expect, it } from "vitest";
import { getValidTaskEvents } from "@/lib/api/transitions";
import { mutationDraftSchema, type EntityContext, type RawMutation } from "@/lib/voice/intent";
import { gateTaskDuplicate } from "@/lib/voice/task-duplicate-gate";

const DONE_ID = "11111111-1111-4111-8111-111111111111";
const OPEN_ID = "22222222-2222-4222-8222-222222222222";
const OLDER_DONE_ID = "33333333-3333-4333-8333-333333333333";
const LIST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function task(overrides: Partial<EntityContext["tasks"][number]> & { id: string }): EntityContext["tasks"][number] {
  const status = overrides.status ?? "Done";
  return { title: "Read Paper A", list_id: null, ...overrides, status, validEvents: overrides.validEvents ?? getValidTaskEvents(status) };
}

function context(tasks: EntityContext["tasks"], todoLists: EntityContext["todoLists"] = []): EntityContext {
  return { courses: [], deadlines: [], tasks, todoLists, sessions: [], appointments: [], knowledgeSources: [], people: [] };
}

function taskMutation(overrides: Record<string, unknown>): RawMutation {
  return mutationDraftSchema.parse({
    target_type: "task",
    operation: "duplicate",
    target_id: null,
    title: null,
    due_at: null,
    reminder_lead_minutes: null,
    priority: null,
    event: null,
    ...overrides,
  });
}

const DUE = "2026-10-05T16:00:00.000Z";

describe("gateTaskDuplicate -- reopen a closed card", () => {
  it("proceeds when the Done card is resolved and the user already gave a due date", () => {
    const raw = taskMutation({ target_id: DONE_ID, due_at: DUE });
    const result = gateTaskDuplicate(raw, null, context([task({ id: DONE_ID })]));
    expect(result).toEqual({ kind: "proceed", mutation: expect.objectContaining({ operation: "duplicate", target_id: DONE_ID, due_at: DUE }) });
  });

  it("asks for the copy's due date once when none was given", () => {
    const raw = taskMutation({ target_id: DONE_ID });
    const result = gateTaskDuplicate(raw, null, context([task({ id: DONE_ID })]));
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") {
      expect(result.question).toMatch(/Reopening "Read Paper A"/);
      expect(result.question).toMatch(/due date/);
      expect(result.mutation).toMatchObject({ operation: "duplicate", target_id: DONE_ID });
    }
  });

  it("proceeds without a due date once that exact question was already asked", () => {
    const ctx = context([task({ id: DONE_ID })]);
    const first = gateTaskDuplicate(taskMutation({ target_id: DONE_ID }), null, ctx);
    if (first.kind !== "ask") throw new Error("expected an ask");

    const second = gateTaskDuplicate(taskMutation({ target_id: DONE_ID }), { mutation: first.mutation, question: first.question }, ctx);
    expect(second.kind).toBe("proceed");
  });

  it("does not inherit a previous card's 'no due date' answer for a different card", () => {
    const ctx = context([task({ id: DONE_ID }), task({ id: OLDER_DONE_ID, title: "Write Report" })]);
    const first = gateTaskDuplicate(taskMutation({ target_id: DONE_ID }), null, ctx);
    if (first.kind !== "ask") throw new Error("expected an ask");

    const other = gateTaskDuplicate(taskMutation({ target_id: OLDER_DONE_ID }), { mutation: first.mutation, question: first.question }, ctx);
    expect(other.kind).toBe("ask");
  });

  it("matches the card by spoken name when the model gave no id", () => {
    const raw = taskMutation({ title: "read paper a", due_at: DUE });
    const result = gateTaskDuplicate(raw, null, context([task({ id: DONE_ID })]));
    expect(result).toEqual({ kind: "proceed", mutation: expect.objectContaining({ target_id: DONE_ID, title: "Read Paper A" }) });
  });

  it("retargets to the Done card when the model picked the Open one and a closed twin exists", () => {
    const raw = taskMutation({ target_id: OPEN_ID, due_at: DUE });
    const ctx = context([task({ id: OPEN_ID, status: "Open" }), task({ id: DONE_ID })]);
    const result = gateTaskDuplicate(raw, null, ctx);
    // An Open twin exists, so it checks before making another copy.
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") {
      expect(result.question).toMatch(/already have an open card called "Read Paper A"/);
      expect(result.mutation).toMatchObject({ operation: "duplicate", target_id: DONE_ID });
    }
  });

  it("proceeds on the second turn once the open-twin question was answered", () => {
    const ctx = context([task({ id: OPEN_ID, status: "Open" }), task({ id: DONE_ID })]);
    const first = gateTaskDuplicate(taskMutation({ target_id: DONE_ID, due_at: DUE }), null, ctx);
    if (first.kind !== "ask") throw new Error("expected an ask");

    const second = gateTaskDuplicate(taskMutation({ target_id: DONE_ID, due_at: DUE }), { mutation: first.mutation, question: first.question }, ctx);
    expect(second.kind).toBe("proceed");
  });

  it("picks the most recently completed card when several Done cards share the name", () => {
    const ctx = context([
      task({ id: OLDER_DONE_ID, completed_at: "2026-09-01T10:00:00.000Z" }),
      task({ id: DONE_ID, completed_at: "2026-09-20T10:00:00.000Z" }),
    ]);
    const result = gateTaskDuplicate(taskMutation({ title: "Read Paper A", due_at: DUE }), null, ctx);
    expect(result).toEqual({ kind: "proceed", mutation: expect.objectContaining({ target_id: DONE_ID }) });
  });

  it("asks which list when completed cards of that name live in different lists", () => {
    const ctx = context(
      [task({ id: DONE_ID, list_id: LIST_A }), task({ id: OLDER_DONE_ID, list_id: LIST_B })],
      [
        { id: LIST_A, name: "Reading", course_id: null },
        { id: LIST_B, name: "CS Seminar", course_id: null },
      ],
    );
    const result = gateTaskDuplicate(taskMutation({ title: "Read Paper A", due_at: DUE }), null, ctx);
    expect(result.kind).toBe("ask");
    if (result.kind === "ask") expect(result.question).toMatch(/Reading or CS Seminar/);
  });

  describe("no closed card matches", () => {
    it("redirects to creating a brand-new card, saving a create as the draft", () => {
      const result = gateTaskDuplicate(taskMutation({ title: "Read Paper Z", due_at: DUE }), null, context([task({ id: DONE_ID })]));
      expect(result.kind).toBe("ask");
      if (result.kind === "ask") {
        expect(result.question).toBe(`I don't see a completed card called "Read Paper Z". Did you mean to create a brand-new card with that name?`);
        expect(result.mutation).toMatchObject({ operation: "create", title: "Read Paper Z", target_id: null, due_at: DUE });
      }
    });

    it("says there is nothing to reopen when the only match is still Open", () => {
      const result = gateTaskDuplicate(taskMutation({ target_id: OPEN_ID }), null, context([task({ id: OPEN_ID, status: "Open" })]));
      expect(result.kind).toBe("ask");
      if (result.kind === "ask") expect(result.question).toMatch(/"Read Paper A" is already open, so there's nothing to reopen/);
    });

    it("lets a duplicate with neither an id nor a name fall through to schema validation", () => {
      const raw = taskMutation({});
      expect(gateTaskDuplicate(raw, null, context([]))).toEqual({ kind: "proceed", mutation: raw });
    });
  });
});

describe("gateTaskDuplicate -- Open cards take priority", () => {
  it("retargets mark-done from a closed card to the Open card of the same name", () => {
    const raw = taskMutation({ operation: "transition", event: "user_marks_done", target_id: DONE_ID });
    const ctx = context([task({ id: DONE_ID }), task({ id: OPEN_ID, status: "Open" })]);
    const result = gateTaskDuplicate(raw, null, ctx);
    expect(result).toEqual({ kind: "proceed", mutation: expect.objectContaining({ target_id: OPEN_ID }) });
  });

  it("prefers the Open twin in the same list when Open cards exist in several lists", () => {
    const raw = taskMutation({ operation: "transition", event: "user_cancels", target_id: DONE_ID });
    const ctx = context([
      task({ id: DONE_ID, list_id: LIST_A }),
      task({ id: OPEN_ID, status: "Open", list_id: LIST_A }),
      task({ id: OLDER_DONE_ID, status: "Open", list_id: LIST_B }),
    ]);
    const result = gateTaskDuplicate(raw, null, ctx);
    expect(result).toEqual({ kind: "proceed", mutation: expect.objectContaining({ target_id: OPEN_ID }) });
  });

  it("leaves a transition alone when no Open twin exists", () => {
    const raw = taskMutation({ operation: "transition", event: "user_marks_done", target_id: DONE_ID });
    expect(gateTaskDuplicate(raw, null, context([task({ id: DONE_ID })]))).toEqual({ kind: "proceed", mutation: raw });
  });

  it("ignores non-task mutations", () => {
    const raw = mutationDraftSchema.parse({
      target_type: "note",
      operation: "create",
      target_id: null,
      body: "hi",
    });
    expect(gateTaskDuplicate(raw, null, context([]))).toEqual({ kind: "proceed", mutation: raw });
  });
});
