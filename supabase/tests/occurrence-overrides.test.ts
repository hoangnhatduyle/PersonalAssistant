import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createAppointment, createAuthenticatedUser, createCourse, type TestUser } from "./helpers";

// Traces: supabase/migrations/0061_occurrence_overrides.sql -- a per-date
// exception to a recurring course/appointment ("this Thursday only"): the
// occurrence is moved/resized or cancelled without touching the series.
describe("occurrence_overrides", () => {
  const admin = adminClient();
  let owner: TestUser;
  let stranger: TestUser;
  let courseId: string;
  let appointmentId: string;

  beforeAll(async () => {
    owner = await createAuthenticatedUser();
    stranger = await createAuthenticatedUser();
    courseId = await createCourse(admin, owner.userId, {
      meeting_blocks: [{ days: [4], startMinutes: 510, endMinutes: 990 }],
    });
    appointmentId = await createAppointment(admin, owner.userId, {
      time: null,
      duration_minutes: null,
      meeting_blocks: [{ days: [2], startMinutes: 540, endMinutes: 600 }],
    });
  });

  const moved = (overrides: Record<string, unknown> = {}) => ({
    user_id: owner.userId,
    course_id: courseId,
    original_date: "2026-11-05",
    original_start_minutes: 510,
    new_date: "2026-11-05",
    new_start_minutes: 780,
    new_end_minutes: 990,
    ...overrides,
  });

  describe("shape constraints", () => {
    it("accepts a moved/resized occurrence of a course", async () => {
      const { error } = await owner.client.from("occurrence_overrides").insert(moved({ original_date: "2026-12-03" }));
      expect(error).toBeNull();
    });

    it("accepts a cancelled occurrence with no new time", async () => {
      const { error } = await owner.client.from("occurrence_overrides").insert({
        user_id: owner.userId,
        course_id: courseId,
        original_date: "2026-12-10",
        original_start_minutes: 510,
        is_cancelled: true,
      });
      expect(error).toBeNull();
    });

    it("accepts an override of a recurring appointment", async () => {
      const { error } = await owner.client.from("occurrence_overrides").insert({
        user_id: owner.userId,
        appointment_id: appointmentId,
        original_date: "2026-11-10",
        original_start_minutes: 540,
        new_date: "2026-11-11",
        new_start_minutes: 600,
        new_end_minutes: 660,
      });
      expect(error).toBeNull();
    });

    it("rejects a row with no parent, or with both parents", async () => {
      const { error: none } = await admin.from("occurrence_overrides").insert(moved({ course_id: null, original_date: "2027-01-07" }));
      expect(none).not.toBeNull();
      const { error: both } = await admin
        .from("occurrence_overrides")
        .insert(moved({ appointment_id: appointmentId, original_date: "2027-01-14" }));
      expect(both).not.toBeNull();
    });

    it("rejects a cancelled row that also carries a new time", async () => {
      const { error } = await admin.from("occurrence_overrides").insert(moved({ is_cancelled: true, original_date: "2027-01-21" }));
      expect(error).not.toBeNull();
    });

    it("rejects a non-cancelled row missing its new date or times", async () => {
      for (const missing of ["new_date", "new_start_minutes", "new_end_minutes"]) {
        const { error } = await admin.from("occurrence_overrides").insert(moved({ [missing]: null, original_date: "2027-01-28" }));
        expect(error, `without ${missing}`).not.toBeNull();
      }
    });

    it("rejects an end at or before the start, and times outside the day (a block can't cross midnight)", async () => {
      const bad: Record<string, unknown>[] = [
        { new_start_minutes: 600, new_end_minutes: 600 },
        { new_start_minutes: 700, new_end_minutes: 650 },
        { new_end_minutes: 1440 },
        { new_start_minutes: -1 },
        { new_start_minutes: 1439, new_end_minutes: 1439 },
      ];
      for (const [index, fields] of bad.entries()) {
        const { error } = await admin.from("occurrence_overrides").insert(moved({ original_date: `2027-02-0${index + 1}`, ...fields }));
        expect(error, JSON.stringify(fields)).not.toBeNull();
      }
    });

    it("rejects an original start outside the day", async () => {
      const { error } = await admin.from("occurrence_overrides").insert(moved({ original_start_minutes: 1440, original_date: "2027-02-10" }));
      expect(error).not.toBeNull();
    });
  });

  describe("one override per occurrence", () => {
    it("rejects a second override for the same course occurrence", async () => {
      const first = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-03-04" }));
      expect(first.error).toBeNull();
      const second = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-03-04", new_start_minutes: 800 }));
      expect(second.error).not.toBeNull();
    });

    it("allows another occurrence at a different start time on the same date, and the same date for a different course", async () => {
      const otherCourseId = await createCourse(admin, owner.userId, { meeting_blocks: [{ days: [4], startMinutes: 900, endMinutes: 960 }] });
      const sameDateOtherStart = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-03-04", original_start_minutes: 600 }));
      expect(sameDateOtherStart.error).toBeNull();
      const sameDateOtherCourse = await admin
        .from("occurrence_overrides")
        .insert(moved({ course_id: otherCourseId, original_date: "2027-03-04" }));
      expect(sameDateOtherCourse.error).toBeNull();
    });

    it("supports replacing an override by upserting on its natural key", async () => {
      const row = moved({ original_date: "2027-03-11" });
      await admin.from("occurrence_overrides").insert(row);
      const { error } = await admin
        .from("occurrence_overrides")
        .upsert({ ...row, new_start_minutes: 840, new_end_minutes: 900 }, { onConflict: "course_id,original_date,original_start_minutes" });
      expect(error).toBeNull();
      const { data } = await admin
        .from("occurrence_overrides")
        .select("new_start_minutes, new_end_minutes")
        .eq("course_id", courseId)
        .eq("original_date", "2027-03-11")
        .single();
      expect(data).toEqual({ new_start_minutes: 840, new_end_minutes: 900 });
    });

    it("keys an appointment's occurrences separately from a course's", async () => {
      const row = {
        user_id: owner.userId,
        appointment_id: appointmentId,
        original_date: "2027-03-16",
        original_start_minutes: 540,
        is_cancelled: true,
      };
      expect((await admin.from("occurrence_overrides").insert(row)).error).toBeNull();
      expect((await admin.from("occurrence_overrides").insert(row)).error).not.toBeNull();
    });
  });

  describe("row-level security and ownership", () => {
    it("lets the owner read, change and delete their own override", async () => {
      await owner.client.from("occurrence_overrides").insert(moved({ original_date: "2027-04-01" }));
      const { data: read } = await owner.client.from("occurrence_overrides").select("id").eq("original_date", "2027-04-01").eq("course_id", courseId);
      expect(read).toHaveLength(1);

      const { error: updateError } = await owner.client
        .from("occurrence_overrides")
        .update({ new_start_minutes: 900, new_end_minutes: 960 })
        .eq("id", read![0].id);
      expect(updateError).toBeNull();

      const { error: deleteError } = await owner.client.from("occurrence_overrides").delete().eq("id", read![0].id);
      expect(deleteError).toBeNull();
      const { data: gone } = await admin.from("occurrence_overrides").select("id").eq("id", read![0].id);
      expect(gone).toHaveLength(0);
    });

    it("hides, and refuses to change or delete, someone else's override", async () => {
      const { data: inserted } = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-04-08" })).select("id").single();

      const { data: seen } = await stranger.client.from("occurrence_overrides").select("id").eq("id", inserted!.id);
      expect(seen).toHaveLength(0);

      await stranger.client.from("occurrence_overrides").update({ new_start_minutes: 1 }).eq("id", inserted!.id);
      await stranger.client.from("occurrence_overrides").delete().eq("id", inserted!.id);
      const { data: still } = await admin.from("occurrence_overrides").select("new_start_minutes").eq("id", inserted!.id).single();
      expect(still?.new_start_minutes).toBe(780);
    });

    it("refuses an insert in another user's name", async () => {
      const { error } = await stranger.client.from("occurrence_overrides").insert(moved({ original_date: "2027-04-15" }));
      expect(error).not.toBeNull();
    });

    it("refuses an override on a course the user does not own, even stamped with their own user_id", async () => {
      const { error } = await stranger.client
        .from("occurrence_overrides")
        .insert(moved({ user_id: stranger.userId, original_date: "2027-04-22" }));
      expect(error).not.toBeNull();
    });

    it("refuses a user_id that doesn't match the parent's owner, for any role", async () => {
      const { error } = await admin.from("occurrence_overrides").insert(moved({ user_id: stranger.userId, original_date: "2027-04-29" }));
      expect(error).not.toBeNull();
    });

    it("refuses re-pointing an existing override at someone else's course", async () => {
      const strangerCourse = await createCourse(admin, stranger.userId, { meeting_blocks: [{ days: [4], startMinutes: 510, endMinutes: 990 }] });
      const { data: inserted } = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-05-06" })).select("id").single();
      const { error } = await admin.from("occurrence_overrides").update({ course_id: strangerCourse }).eq("id", inserted!.id);
      expect(error).not.toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("is removed along with its parent course", async () => {
      const doomedCourse = await createCourse(admin, owner.userId, { meeting_blocks: [{ days: [4], startMinutes: 510, endMinutes: 990 }] });
      await admin.from("occurrence_overrides").insert(moved({ course_id: doomedCourse, original_date: "2027-05-13" }));
      await admin.from("courses").delete().eq("id", doomedCourse);
      const { data } = await admin.from("occurrence_overrides").select("id").eq("course_id", doomedCourse);
      expect(data).toHaveLength(0);
    });

    it("is removed along with its parent appointment", async () => {
      const doomed = await createAppointment(admin, owner.userId, { time: null, duration_minutes: null, meeting_blocks: [{ days: [2], startMinutes: 540, endMinutes: 600 }] });
      await admin.from("occurrence_overrides").insert({
        user_id: owner.userId,
        appointment_id: doomed,
        original_date: "2027-05-18",
        original_start_minutes: 540,
        is_cancelled: true,
      });
      await admin.from("appointments").delete().eq("id", doomed);
      const { data } = await admin.from("occurrence_overrides").select("id").eq("appointment_id", doomed);
      expect(data).toHaveLength(0);
    });

    it("stamps updated_at when changed", async () => {
      const { data: inserted } = await admin.from("occurrence_overrides").insert(moved({ original_date: "2027-05-20" })).select("id, updated_at").single();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await admin.from("occurrence_overrides").update({ new_start_minutes: 800 }).eq("id", inserted!.id);
      const { data: after } = await admin.from("occurrence_overrides").select("updated_at").eq("id", inserted!.id).single();
      expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(new Date(inserted!.updated_at as string).getTime());
    });
  });
});
