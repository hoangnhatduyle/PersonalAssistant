import { describe, expect, it } from "vitest";
import { llmResponseSchema, mutationSchema, toPendingMutation } from "../intent";

const VALID_TARGET_ID = "11111111-1111-4111-8111-111111111111";
const VALID_COURSE_ID = "22222222-2222-4222-8222-222222222222";

describe("mutationSchema", () => {
  it("accepts a valid create (no target_id required)", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects update/delete with a null target_id (review finding: target_id was nullable regardless of operation)", () => {
    const result = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "update",
      target_id: null,
      course_id: null,
      title: "New title",
      due_at: null,
      priority: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a deadline create missing a required field", () => {
    const missingTitle = mutationSchema.safeParse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: null,
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(missingTitle.success).toBe(false);
  });

  it("rejects a task create with no title", () => {
    const result = mutationSchema.safeParse({ target_type: "task", operation: "create", target_id: null, title: null, due_at: null });
    expect(result.success).toBe(false);
  });

  it("rejects a note create with no body", () => {
    const result = mutationSchema.safeParse({ target_type: "note", operation: "create", target_id: null, body: null });
    expect(result.success).toBe(false);
  });

  it("requires snooze_until when event is user_snoozes", () => {
    const missing = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: null,
    });
    expect(missing.success).toBe(false);

    const present = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: "2026-09-01T00:00:00.000Z",
    });
    expect(present.success).toBe(true);
  });

  it("does not require snooze_until for user_acknowledges/user_dismisses", () => {
    const result = mutationSchema.safeParse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_acknowledges",
      snooze_until: null,
    });
    expect(result.success).toBe(true);
  });

  it("a course delete always requires a non-null target_id (schema-level, not just the shared refine)", () => {
    const result = mutationSchema.safeParse({ target_type: "course", operation: "delete", target_id: null });
    expect(result.success).toBe(false);
  });
});

describe("llmResponseSchema", () => {
  it("rejects read_only: true with a non-null mutation", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.99,
      read_only: true,
      summary: "ok",
      query_kind: "upcoming_schedule",
      mutation: { target_type: "course", operation: "delete", target_id: VALID_TARGET_ID },
    });
    expect(result.success).toBe(false);
  });

  it("rejects read_only: false with a null mutation (review finding: this crashed session.ts's old unchecked cast)", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.99,
      read_only: false,
      summary: "ok",
      query_kind: null,
      mutation: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed read-only response", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.99,
      read_only: true,
      summary: "your upcoming schedule",
      query_kind: "upcoming_schedule",
      mutation: null,
    });
    expect(result.success).toBe(true);
  });

  // SPEC-API-008/SPEC-VOICE-005: knowledge_lookup is the second supported
  // read-only query_kind, added alongside upcoming_schedule.
  it("accepts a well-formed knowledge_lookup response", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.98,
      read_only: true,
      summary: "look up financial aid deadlines",
      query_kind: "knowledge_lookup",
      mutation: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized query_kind", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.98,
      read_only: true,
      summary: "something else",
      query_kind: "web_search",
      mutation: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed mutating response", () => {
    const result = llmResponseSchema.safeParse({
      confidence: 0.97,
      read_only: false,
      summary: "delete the course",
      query_kind: null,
      mutation: { target_type: "course", operation: "delete", target_id: VALID_TARGET_ID },
    });
    expect(result.success).toBe(true);
  });
});

describe("toPendingMutation", () => {
  it("maps a course delete", () => {
    const raw = mutationSchema.parse({ target_type: "course", operation: "delete", target_id: VALID_TARGET_ID });
    expect(toPendingMutation(raw)).toEqual({ targetType: "course", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a deadline create, dropping null-valued optional fields", () => {
    const raw = mutationSchema.parse({
      target_type: "deadline",
      operation: "create",
      target_id: null,
      course_id: VALID_COURSE_ID,
      title: "Essay draft",
      due_at: "2026-09-01T00:00:00.000Z",
      priority: null,
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "deadline",
      operation: "create",
      payload: { course_id: VALID_COURSE_ID, title: "Essay draft", due_at: "2026-09-01T00:00:00.000Z", priority: undefined },
    });
  });

  it("maps a task update, including only the fields actually provided", () => {
    const raw = mutationSchema.parse({
      target_type: "task",
      operation: "update",
      target_id: VALID_TARGET_ID,
      title: "Renamed",
      due_at: null,
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "task",
      operation: "update",
      targetId: VALID_TARGET_ID,
      payload: { title: "Renamed" },
    });
  });

  it("maps a note delete", () => {
    const raw = mutationSchema.parse({ target_type: "note", operation: "delete", target_id: VALID_TARGET_ID, body: null });
    expect(toPendingMutation(raw)).toEqual({ targetType: "note", operation: "delete", targetId: VALID_TARGET_ID });
  });

  it("maps a reminder acknowledge with a snooze", () => {
    const raw = mutationSchema.parse({
      target_type: "reminder",
      operation: "acknowledge",
      target_id: VALID_TARGET_ID,
      event: "user_snoozes",
      snooze_until: "2026-09-01T00:00:00.000Z",
    });
    expect(toPendingMutation(raw)).toEqual({
      targetType: "reminder",
      operation: "acknowledge",
      targetId: VALID_TARGET_ID,
      event: "user_snoozes",
      snoozeUntil: "2026-09-01T00:00:00.000Z",
    });
  });
});
