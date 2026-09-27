import { describe, expect, it } from "vitest";
import { buildOccurrenceStatusMap, occurrenceStatusMapKey, resolveDisplayedEventStatus } from "../occurrence-status";
import type { AppointmentRow } from "@/lib/api/entity-types";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

// Same convention as conflicts.test.ts's local fixture.
function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    title: "Event",
    date: "2026-01-04",
    category: "Personal",
    time: "14:00",
    location: null,
    notes: [],
    reminders_enabled: false,
    reminder_lead_minutes: 60,
    deadline_id: null,
    duration_minutes: 60,
    session_status: null,
    event_status: "planned",
    meeting_blocks: [],
    recurrence_start_date: null,
    recurrence_end_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    user_id: "u-1",
    ...overrides,
  };
}

// Matches every day of the week, all day — the occurrence resolved for any
// `now` passed to getNextOccurrence is always that same calendar day
// (offset 0), same technique upcoming-items.test.ts uses for determinism.
const ALL_DAY_EVERY_DAY: MeetingBlock[] = [{ days: [0, 1, 2, 3, 4, 5, 6], startMinutes: 0, endMinutes: 23 * 60 + 59 }];

// Midnight exactly — ALL_DAY_EVERY_DAY's startMinutes:0 block is still >= "now"
// at offset 0, so the resolved occurrence is today (2026-09-26), not tomorrow
// (see getNextOccurrence's `offset > 0 || block.startMinutes >= nowMinutes` guard).
const NOW = new Date(2026, 8, 26, 0, 0);

describe("resolveDisplayedEventStatus", () => {
  it("non-recurring: returns appointment.event_status unchanged, ignoring occurrenceStatusByKey entirely", () => {
    const appointment = makeAppointment({ meeting_blocks: [], event_status: "done" });
    const occurrenceStatusByKey = new Map([[occurrenceStatusMapKey(appointment.id, "2026-09-26"), "missed" as const]]);
    expect(resolveDisplayedEventStatus(appointment, occurrenceStatusByKey, NOW)).toBe("done");
  });

  it("recurring with no row for the relevant occurrence: defaults to planned", () => {
    const appointment = makeAppointment({ meeting_blocks: ALL_DAY_EVERY_DAY, event_status: "planned" });
    expect(resolveDisplayedEventStatus(appointment, new Map(), NOW)).toBe("planned");
  });

  it("recurring with a matching row for the relevant occurrence: returns that row's status", () => {
    const appointment = makeAppointment({ meeting_blocks: ALL_DAY_EVERY_DAY });
    const occurrenceStatusByKey = new Map([[occurrenceStatusMapKey(appointment.id, "2026-09-26"), "done" as const]]);
    expect(resolveDisplayedEventStatus(appointment, occurrenceStatusByKey, NOW)).toBe("done");
  });

  // The direct regression test for the bug this whole feature fixes: marking
  // one occurrence done must never leak into a different occurrence's
  // displayed status.
  it("recurring with only a DIFFERENT occurrence date's row present: does not apply, still defaults to planned", () => {
    const appointment = makeAppointment({ meeting_blocks: ALL_DAY_EVERY_DAY, event_status: "planned" });
    // Even though appointment.event_status were somehow "done" here, this
    // branch never reads it — only the map, keyed by the exact resolved date.
    const occurrenceStatusByKey = new Map([[occurrenceStatusMapKey(appointment.id, "2026-10-03"), "done" as const]]);
    expect(resolveDisplayedEventStatus(appointment, occurrenceStatusByKey, NOW)).toBe("planned");
  });

  it("recurring with no more occurrences (recurrence_end_date has passed): returns null", () => {
    const appointment = makeAppointment({
      meeting_blocks: ALL_DAY_EVERY_DAY,
      recurrence_end_date: "2026-09-01",
    });
    expect(resolveDisplayedEventStatus(appointment, new Map(), NOW)).toBeNull();
  });

  it("recurring: a row for another appointment entirely does not leak in", () => {
    const appointment = makeAppointment({ id: "appt-1", meeting_blocks: ALL_DAY_EVERY_DAY });
    const occurrenceStatusByKey = new Map([[occurrenceStatusMapKey("appt-2", "2026-09-26"), "done" as const]]);
    expect(resolveDisplayedEventStatus(appointment, occurrenceStatusByKey, NOW)).toBe("planned");
  });
});

describe("buildOccurrenceStatusMap", () => {
  it("flattens each appointment's embedded occurrence-status rows into one map, keyed by appointment id + occurrence date", () => {
    const appointments = [
      makeAppointment({
        id: "appt-1",
        appointment_occurrence_status: [
          { occurrence_date: "2026-09-26", status: "done" },
          { occurrence_date: "2026-10-03", status: "missed" },
        ],
      }),
      makeAppointment({ id: "appt-2", appointment_occurrence_status: [{ occurrence_date: "2026-09-26", status: "missed" }] }),
    ];
    const map = buildOccurrenceStatusMap(appointments);
    expect(map.get(occurrenceStatusMapKey("appt-1", "2026-09-26"))).toBe("done");
    expect(map.get(occurrenceStatusMapKey("appt-1", "2026-10-03"))).toBe("missed");
    expect(map.get(occurrenceStatusMapKey("appt-2", "2026-09-26"))).toBe("missed");
  });

  it("handles an appointment with no embedded relation (undefined) without throwing", () => {
    const appointments = [makeAppointment({ id: "appt-1", appointment_occurrence_status: undefined })];
    expect(buildOccurrenceStatusMap(appointments).size).toBe(0);
  });
});
