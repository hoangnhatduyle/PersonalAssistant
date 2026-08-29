import { describe, expect, it } from "vitest";
import {
  coursePatchSchema,
  coursePayloadSchema,
  deadlinePatchSchema,
  deadlinePayloadSchema,
  feedbackPayloadSchema,
  notePayloadSchema,
  reminderAckSchema,
  taskPatchSchema,
  taskPayloadSchema,
} from "../schemas";

describe("coursePayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(coursePayloadSchema.safeParse({ name: "CS 101" }).success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(coursePayloadSchema.safeParse({}).success).toBe(false);
  });

  it("coursePatchSchema makes every field optional", () => {
    expect(coursePatchSchema.safeParse({}).success).toBe(true);
    expect(coursePatchSchema.safeParse({ reminders_enabled: false }).success).toBe(true);
  });
});

describe("deadlinePayloadSchema", () => {
  const base = { course_id: "550e8400-e29b-41d4-a716-446655440000", title: "Essay", due_at: "2026-09-01T12:00:00Z" };

  it("accepts a valid payload", () => {
    expect(deadlinePayloadSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a non-uuid course_id", () => {
    expect(deadlinePayloadSchema.safeParse({ ...base, course_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-ISO due_at", () => {
    expect(deadlinePayloadSchema.safeParse({ ...base, due_at: "next tuesday" }).success).toBe(false);
  });

  it("deadlinePatchSchema does not accept course_id at all (no reassigning Course via PATCH)", () => {
    const parsed = deadlinePatchSchema.safeParse({ course_id: base.course_id, title: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("course_id" in parsed.data).toBe(false);
    }
  });
});

describe("patch schemas strip forbidden/unknown fields to an empty object", () => {
  // Regression: a PATCH body containing only `status` (or another
  // unrecognized field) parses successfully with every key stripped. Route
  // handlers must treat an empty parsed.data as a 400, not forward it to
  // PostgREST as an update with no columns set (that throws PGRST116 "cannot
  // coerce the result to a single JSON object" -> a masked 500).
  it("taskPatchSchema strips a bare status field to {}", () => {
    const parsed = taskPatchSchema.safeParse({ status: "Open" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toHaveLength(0);
  });

  it("deadlinePatchSchema strips status and course_id to {}", () => {
    const parsed = deadlinePatchSchema.safeParse({ status: "Overdue", course_id: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toHaveLength(0);
  });
});

describe("taskPayloadSchema", () => {
  it("accepts a task with no due_at", () => {
    expect(taskPayloadSchema.safeParse({ title: "Buy milk" }).success).toBe(true);
  });

  it("accepts an explicit null due_at (clearing it)", () => {
    expect(taskPayloadSchema.safeParse({ title: "Buy milk", due_at: null }).success).toBe(true);
  });

  it("rejects a missing title", () => {
    expect(taskPayloadSchema.safeParse({}).success).toBe(false);
  });
});

describe("reminderAckSchema", () => {
  it("accepts acknowledge/dismiss with no snooze_until", () => {
    expect(reminderAckSchema.safeParse({ event: "user_acknowledges" }).success).toBe(true);
    expect(reminderAckSchema.safeParse({ event: "user_dismisses" }).success).toBe(true);
  });

  it("accepts user_snoozes with a future snooze_until", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(reminderAckSchema.safeParse({ event: "user_snoozes", snooze_until: future }).success).toBe(true);
  });

  it("rejects an unknown event", () => {
    expect(reminderAckSchema.safeParse({ event: "not_a_real_event" }).success).toBe(false);
  });

  it("rejects a non-ISO snooze_until", () => {
    expect(reminderAckSchema.safeParse({ event: "user_snoozes", snooze_until: "tomorrow" }).success).toBe(false);
  });

  it("rejects a past snooze_until", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(reminderAckSchema.safeParse({ event: "user_snoozes", snooze_until: past }).success).toBe(false);
  });
});

describe("notePayloadSchema", () => {
  it("accepts a bare note", () => {
    expect(notePayloadSchema.safeParse({ body: "remember this" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(notePayloadSchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("feedbackPayloadSchema", () => {
  const base = { target_type: "deadline" as const, target_id: "550e8400-e29b-41d4-a716-446655440000", rating: 4 };

  it("accepts a valid payload with no comment", () => {
    expect(feedbackPayloadSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a valid payload with a comment", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, comment: "reminder fired too late" }).success).toBe(true);
  });

  it("accepts task and reminder target types", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, target_type: "task" }).success).toBe(true);
    expect(feedbackPayloadSchema.safeParse({ ...base, target_type: "reminder" }).success).toBe(true);
  });

  it("rejects an unknown target_type", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, target_type: "course" }).success).toBe(false);
  });

  it("rejects a non-uuid target_id", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, target_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a rating below 1 or above 5", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
    expect(feedbackPayloadSchema.safeParse({ ...base, rating: 6 }).success).toBe(false);
  });

  it("rejects a non-integer rating", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, rating: 3.5 }).success).toBe(false);
  });

  it("rejects an empty comment", () => {
    expect(feedbackPayloadSchema.safeParse({ ...base, comment: "" }).success).toBe(false);
  });
});
