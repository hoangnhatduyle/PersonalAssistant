import { describe, expect, it } from "vitest";
import { hasPatternChanged } from "@/lib/api/series-pattern";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

const THURSDAY: MeetingBlock = { days: [4], startMinutes: 510, endMinutes: 990 };
const before = { meeting_blocks: [THURSDAY], recurrence_start_date: null, recurrence_end_date: null };

describe("hasPatternChanged", () => {
  it("is false when nothing about the pattern is in the patch", () => {
    expect(hasPatternChanged(before, {})).toBe(false);
  });

  it("is false when the same blocks are resubmitted, whatever the key or day order", () => {
    // Postgres jsonb hands keys back in its own order (length, then alphabetical); the API payload has another.
    const fromDatabase = JSON.parse('{"days":[1,4],"endMinutes":990,"startMinutes":510}') as MeetingBlock;
    const fromPayload: MeetingBlock = { days: [4, 1], startMinutes: 510, endMinutes: 990 };
    expect(hasPatternChanged({ ...before, meeting_blocks: [fromDatabase] }, { meeting_blocks: [fromPayload] })).toBe(false);
  });

  it("is true when a block's time, days or number changes", () => {
    expect(hasPatternChanged(before, { meeting_blocks: [{ ...THURSDAY, startMinutes: 780 }] })).toBe(true);
    expect(hasPatternChanged(before, { meeting_blocks: [{ ...THURSDAY, days: [4, 5] }] })).toBe(true);
    expect(hasPatternChanged(before, { meeting_blocks: [THURSDAY, { days: [2], startMinutes: 600, endMinutes: 660 }] })).toBe(true);
    expect(hasPatternChanged(before, { meeting_blocks: [] })).toBe(true);
  });

  it("is true when the recurrence date range changes, false when resubmitted unchanged", () => {
    expect(hasPatternChanged(before, { recurrence_start_date: "2026-09-01" })).toBe(true);
    expect(hasPatternChanged(before, { recurrence_end_date: "2026-12-11" })).toBe(true);
    expect(hasPatternChanged(before, { recurrence_start_date: null, recurrence_end_date: null })).toBe(false);
    expect(hasPatternChanged({ ...before, recurrence_end_date: "2026-12-11" }, { recurrence_end_date: "2026-12-11" })).toBe(false);
  });
});
