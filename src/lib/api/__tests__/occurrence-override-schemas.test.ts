import { describe, expect, it } from "vitest";
import { occurrenceOverrideKeySchema, occurrenceOverridePayloadSchema } from "@/lib/api/schemas";

const KEY = { original_date: "2026-11-05", original_start_minutes: 510 };

describe("occurrenceOverridePayloadSchema", () => {
  it("accepts a moved/resized occurrence", () => {
    const parsed = occurrenceOverridePayloadSchema.safeParse({ ...KEY, new_date: "2026-11-05", new_start_minutes: 780, new_end_minutes: 990 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ is_cancelled: false });
  });

  it("accepts a cancelled occurrence with no new time", () => {
    const parsed = occurrenceOverridePayloadSchema.safeParse({ ...KEY, is_cancelled: true });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ is_cancelled: true, new_date: null, new_start_minutes: null, new_end_minutes: null });
  });

  it("rejects a cancelled occurrence that also names a new time", () => {
    expect(occurrenceOverridePayloadSchema.safeParse({ ...KEY, is_cancelled: true, new_date: "2026-11-06", new_start_minutes: 600, new_end_minutes: 660 }).success).toBe(false);
  });

  it("rejects a move missing its new date or either time", () => {
    const full = { ...KEY, new_date: "2026-11-05", new_start_minutes: 780, new_end_minutes: 990 };
    for (const field of ["new_date", "new_start_minutes", "new_end_minutes"] as const) {
      expect(occurrenceOverridePayloadSchema.safeParse({ ...full, [field]: undefined }).success, field).toBe(false);
      expect(occurrenceOverridePayloadSchema.safeParse({ ...full, [field]: null }).success, `${field} null`).toBe(false);
    }
  });

  it("rejects an end at or before the start, and times that would cross midnight", () => {
    const base = { ...KEY, new_date: "2026-11-05" };
    expect(occurrenceOverridePayloadSchema.safeParse({ ...base, new_start_minutes: 600, new_end_minutes: 600 }).success).toBe(false);
    expect(occurrenceOverridePayloadSchema.safeParse({ ...base, new_start_minutes: 700, new_end_minutes: 650 }).success).toBe(false);
    expect(occurrenceOverridePayloadSchema.safeParse({ ...base, new_start_minutes: 600, new_end_minutes: 1440 }).success).toBe(false);
    expect(occurrenceOverridePayloadSchema.safeParse({ ...base, new_start_minutes: -1, new_end_minutes: 60 }).success).toBe(false);
  });

  it("rejects a malformed date or an original start outside the day", () => {
    expect(occurrenceOverridePayloadSchema.safeParse({ ...KEY, original_date: "11/05/2026", is_cancelled: true }).success).toBe(false);
    expect(occurrenceOverridePayloadSchema.safeParse({ ...KEY, original_start_minutes: 1440, is_cancelled: true }).success).toBe(false);
    expect(occurrenceOverridePayloadSchema.safeParse({ ...KEY, new_date: "nope", new_start_minutes: 600, new_end_minutes: 660 }).success).toBe(false);
  });

  it("rejects non-integer minutes", () => {
    expect(occurrenceOverridePayloadSchema.safeParse({ ...KEY, new_date: "2026-11-05", new_start_minutes: 600.5, new_end_minutes: 660 }).success).toBe(false);
  });
});

describe("occurrenceOverrideKeySchema", () => {
  it("reads the occurrence key from query-string values", () => {
    expect(occurrenceOverrideKeySchema.parse({ original_date: "2026-11-05", original_start_minutes: "510" })).toEqual(KEY);
  });

  it("rejects a missing or malformed key", () => {
    expect(occurrenceOverrideKeySchema.safeParse({ original_date: "2026-11-05" }).success).toBe(false);
    expect(occurrenceOverrideKeySchema.safeParse({ original_date: "2026-11-05", original_start_minutes: "abc" }).success).toBe(false);
    expect(occurrenceOverrideKeySchema.safeParse({ original_date: "bad", original_start_minutes: "510" }).success).toBe(false);
  });
});
