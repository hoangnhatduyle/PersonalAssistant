import { expect, test } from "@playwright/test";
import { admin, createUserAndSignIn } from "./fixtures";
import { createAppointment } from "../supabase/tests/helpers";
import { getRelevantOccurrenceDateKey, type MeetingBlock } from "@/lib/calendar/recurrence";

// Traces: supabase/migrations/0049_appointment_occurrence_status.sql,
// POST /api/appointments/[id]/transition's recurring branch (Part 1 Phase 3
// of plan-out-carefully-for-keen-marble.md).
test.describe("POST /api/appointments/[id]/transition: recurring occurrence writes", () => {
  test("requires occurrenceDate for a recurring appointment, writes to appointment_occurrence_status (never the row's own event_status), and keeps two occurrences independent", async ({
    page,
  }) => {
    const user = await createUserAndSignIn(page);

    const meetingBlocks: MeetingBlock[] = [{ days: [0, 1, 2, 3, 4, 5, 6], startMinutes: 0, endMinutes: 23 * 60 + 59 }];
    const appointmentId = await createAppointment(admin, user.userId, {
      title: "Recurring standup",
      time: null,
      duration_minutes: null,
      meeting_blocks: meetingBlocks,
      recurrence_start_date: null,
      recurrence_end_date: null,
    });

    const occurrenceDate = getRelevantOccurrenceDateKey(meetingBlocks, new Date(), null, null);
    expect(occurrenceDate).not.toBeNull();

    // Missing occurrenceDate on a recurring appointment -> 400.
    const missing = await page.request.post(`/api/appointments/${appointmentId}/transition`, {
      data: { event: "user_marks_event_done" },
    });
    expect(missing.status()).toBe(400);

    // Marking this occurrence done succeeds and never touches the row's own event_status.
    const done = await page.request.post(`/api/appointments/${appointmentId}/transition`, {
      data: { event: "user_marks_event_done", occurrenceDate },
    });
    expect(done.ok()).toBe(true);

    const { data: appointmentRow } = await admin.from("appointments").select("event_status").eq("id", appointmentId).single();
    expect(appointmentRow?.event_status).toBe("planned");

    const { data: occurrenceRow } = await admin
      .from("appointment_occurrence_status")
      .select("status")
      .eq("appointment_id", appointmentId)
      .eq("occurrence_date", occurrenceDate as string)
      .single();
    expect(occurrenceRow?.status).toBe("done");

    // A second, different occurrence transitions independently of the first.
    const otherOccurrenceDate = "2099-01-01";
    const otherDone = await page.request.post(`/api/appointments/${appointmentId}/transition`, {
      data: { event: "user_marks_event_missed", occurrenceDate: otherOccurrenceDate },
    });
    expect(otherDone.ok()).toBe(true);

    const { data: otherOccurrenceRow } = await admin
      .from("appointment_occurrence_status")
      .select("status")
      .eq("appointment_id", appointmentId)
      .eq("occurrence_date", otherOccurrenceDate)
      .single();
    expect(otherOccurrenceRow?.status).toBe("missed");

    // The first occurrence's status is untouched by the second's transition.
    const { data: firstOccurrenceStillDone } = await admin
      .from("appointment_occurrence_status")
      .select("status")
      .eq("appointment_id", appointmentId)
      .eq("occurrence_date", occurrenceDate as string)
      .single();
    expect(firstOccurrenceStillDone?.status).toBe("done");
  });

  test("a non-recurring event's transition is unaffected: still writes appointments.event_status directly, no occurrenceDate needed", async ({
    page,
  }) => {
    const user = await createUserAndSignIn(page);
    const appointmentId = await createAppointment(admin, user.userId, { title: "One-off checkup" });

    const response = await page.request.post(`/api/appointments/${appointmentId}/transition`, {
      data: { event: "user_marks_event_done" },
    });
    expect(response.ok()).toBe(true);

    const { data: appointmentRow } = await admin.from("appointments").select("event_status").eq("id", appointmentId).single();
    expect(appointmentRow?.event_status).toBe("done");

    const { data: occurrenceRows } = await admin.from("appointment_occurrence_status").select("id").eq("appointment_id", appointmentId);
    expect(occurrenceRows ?? []).toHaveLength(0);
  });

  test("reopening a done occurrence writes planned for that occurrence only; a one-off event reopens via event_status", async ({
    page,
  }) => {
    const user = await createUserAndSignIn(page);

    const meetingBlocks: MeetingBlock[] = [{ days: [0, 1, 2, 3, 4, 5, 6], startMinutes: 0, endMinutes: 23 * 60 + 59 }];
    const recurringId = await createAppointment(admin, user.userId, {
      title: "Recurring standup",
      time: null,
      duration_minutes: null,
      meeting_blocks: meetingBlocks,
      recurrence_start_date: null,
      recurrence_end_date: null,
    });
    const occurrenceDate = getRelevantOccurrenceDateKey(meetingBlocks, new Date(), null, null) as string;
    const otherOccurrenceDate = "2099-01-01";

    for (const date of [occurrenceDate, otherOccurrenceDate]) {
      const done = await page.request.post(`/api/appointments/${recurringId}/transition`, {
        data: { event: "user_marks_event_done", occurrenceDate: date },
      });
      expect(done.ok()).toBe(true);
    }

    const reopen = await page.request.post(`/api/appointments/${recurringId}/transition`, {
      data: { event: "user_reopens_event", occurrenceDate },
    });
    expect(reopen.ok()).toBe(true);

    const { data: rows } = await admin
      .from("appointment_occurrence_status")
      .select("occurrence_date, status")
      .eq("appointment_id", recurringId);
    const byDate = Object.fromEntries((rows ?? []).map((row) => [row.occurrence_date, row.status]));
    expect(byDate[occurrenceDate]).toBe("planned");
    expect(byDate[otherOccurrenceDate]).toBe("done");

    // A planned occurrence cannot be "reopened" again.
    const again = await page.request.post(`/api/appointments/${recurringId}/transition`, {
      data: { event: "user_reopens_event", occurrenceDate },
    });
    expect(again.ok()).toBe(false);

    // One-off: done -> reopen -> planned on the row itself.
    const oneOffId = await createAppointment(admin, user.userId, { title: "One-off checkup" });
    await page.request.post(`/api/appointments/${oneOffId}/transition`, { data: { event: "user_marks_event_missed" } });
    const oneOffReopen = await page.request.post(`/api/appointments/${oneOffId}/transition`, {
      data: { event: "user_reopens_event" },
    });
    expect(oneOffReopen.ok()).toBe(true);
    const { data: oneOffRow } = await admin.from("appointments").select("event_status").eq("id", oneOffId).single();
    expect(oneOffRow?.event_status).toBe("planned");
  });
});
