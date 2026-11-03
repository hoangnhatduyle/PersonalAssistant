import { describe, expect, it } from "vitest";
import type { EntityContext } from "@/lib/voice/intent";
import { collectKnownIds, repairId, repairIdsInArgs } from "../id-repair";

// The real pair from the live eval: the model kept the first group and garbled the rest.
const QUIZ_A = "14eaf9f1-81c5-483c-9997-f88104fa3869";
const QUIZ_A_GARBLED = "14eaf9f1-81d5-4c12-8335-56319340c5df";
const QUIZ_B = "1d2b3ef4-eec6-4b37-af75-caa3656ac3a8";
const COURSE = "99999999-9999-4999-8999-999999999999";
const PERSON = "77777777-7777-4777-8777-777777777777";

const context = {
  courses: [{ id: COURSE, code: "CS101", name: "Algorithms" }],
  deadlines: [
    { id: QUIZ_A, title: "Weekly Quiz", course_id: COURSE },
    { id: QUIZ_B, title: "Weekly Quiz", course_id: COURSE },
  ],
  tasks: [],
  todoLists: [],
  sessions: [],
  appointments: [],
  knowledgeSources: [],
  people: [{ id: PERSON, name: "Châu", relationship: "sister" }],
} as unknown as EntityContext;

describe("collectKnownIds", () => {
  it("gathers ids across every entity type, once each", () => {
    expect(collectKnownIds(context).sort()).toEqual([COURSE, PERSON, QUIZ_A, QUIZ_B].sort());
  });
});

describe("repairId", () => {
  const known = collectKnownIds(context);

  it("repairs an id whose first group is right and whose tail is garbled", () => {
    expect(repairId(QUIZ_A_GARBLED, known)).toBe(QUIZ_A);
  });

  it("is case-insensitive on the prefix and returns the canonical id", () => {
    expect(repairId(QUIZ_A_GARBLED.toUpperCase(), known)).toBe(QUIZ_A);
  });

  it("leaves an exact id alone", () => {
    expect(repairId(QUIZ_A, known)).toBeNull();
  });

  it("leaves an id with no matching prefix alone, so unknown ids are still reported as unknown", () => {
    expect(repairId("55555555-5555-4555-8555-555555555555", known)).toBeNull();
  });

  it("refuses to guess when two known ids share the prefix", () => {
    const ambiguous = [...known, "14eaf9f1-0000-4000-8000-000000000000"];
    expect(repairId(QUIZ_A_GARBLED, ambiguous)).toBeNull();
  });

  it.each([null, undefined, 42, "", "not-a-uuid", "final-project-report", "14ea", "xyzxyzxy-1111"])("ignores a value that does not start with 8 hex characters: %j", (value) => {
    expect(repairId(value, known)).toBeNull();
  });

  it("does not match on fewer than 8 characters", () => {
    expect(repairId("14eaf9f", known)).toBeNull();
  });
});

describe("repairIdsInArgs", () => {
  it("repairs the id fields of a propose_mutation call and reports what changed", () => {
    const { value, repairs } = repairIdsInArgs({ target_type: "deadline", operation: "delete", target_id: QUIZ_A_GARBLED, course_id: COURSE, title: null }, context);
    expect(value).toEqual({ target_type: "deadline", operation: "delete", target_id: QUIZ_A, course_id: COURSE, title: null });
    expect(repairs).toEqual([{ field: "target_id", from: QUIZ_A_GARBLED, to: QUIZ_A }]);
  });

  it("repairs ids inside additional_steps too", () => {
    const { value, repairs } = repairIdsInArgs(
      { target_id: QUIZ_B, additional_steps: [{ summary: "next", target_id: QUIZ_A_GARBLED }, { summary: "other", target_id: null }] },
      context,
    );
    expect(value).toEqual({ target_id: QUIZ_B, additional_steps: [{ summary: "next", target_id: QUIZ_A }, { summary: "other", target_id: null }] });
    expect(repairs).toHaveLength(1);
  });

  it("repairs person_id and deadline_id for the read tools", () => {
    expect(repairIdsInArgs({ person_id: "77777777-7777-4777-8777-77777777ffff" }, context).value).toEqual({ person_id: PERSON });
    expect(repairIdsInArgs({ deadline_id: QUIZ_A_GARBLED }, context).value).toEqual({ deadline_id: QUIZ_A });
  });

  it("never touches free-text fields or ids it does not manage, even when they look like a garbled id", () => {
    const args = { title: QUIZ_A_GARBLED, body: QUIZ_A_GARBLED, triage_item_id: QUIZ_A_GARBLED };
    const { value, repairs } = repairIdsInArgs(args, context);
    expect(value).toEqual(args);
    expect(repairs).toEqual([]);
  });

  it("does not mutate its input", () => {
    const args = { target_id: QUIZ_A_GARBLED, additional_steps: [{ target_id: QUIZ_A_GARBLED }] };
    const snapshot = structuredClone(args);
    repairIdsInArgs(args, context);
    expect(args).toEqual(snapshot);
  });

  it.each([null, undefined, "text", 5, [QUIZ_A_GARBLED]])("returns a non-object untouched so the caller's own validation reports it: %j", (raw) => {
    expect(repairIdsInArgs(raw, context)).toEqual({ value: raw, repairs: [] });
  });
});
