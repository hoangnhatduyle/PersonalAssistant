import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createAppointment,
  createAuthenticatedUser,
  walkTransitions,
  type TestUser,
} from "./helpers";

// Traces: supabase/migrations/0049_appointment_occurrence_status.sql --
// per-occurrence completion tracking for recurring appointments, mirroring
// guard_event_status's terminal semantics (0027/0028) on a new table instead
// of the appointments row itself.
describe("guard_appointment_occurrence_status trigger", () => {
  const admin = adminClient();
  let userId: string;

  beforeAll(async () => {
    const user = await createAuthenticatedUser();
    userId = user.userId;
  });

  describe("INSERT (no initial-state restriction, unlike appointments/deadlines/tasks)", () => {
    it("accepts an occurrence-status row inserted with the default planned status", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { error } = await admin.from("appointment_occurrence_status").insert({
        appointment_id: appointmentId,
        occurrence_date: "2026-09-26",
      });
      expect(error).toBeNull();
    });

    it("accepts an occurrence-status row inserted straight into done", async () => {
      // The real write path (Phase 3): an occurrence with no row yet is
      // implicitly planned, so the first "mark done" for it upserts status
      // 'done' directly -- there is no separate "create the row as planned"
      // step for the guard to have run first.
      const appointmentId = await createAppointment(admin, userId);
      const { error } = await admin.from("appointment_occurrence_status").insert({
        appointment_id: appointmentId,
        occurrence_date: "2026-09-26",
        status: "done",
      });
      expect(error).toBeNull();
    });

    it("accepts an occurrence-status row inserted straight into missed", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { error } = await admin.from("appointment_occurrence_status").insert({
        appointment_id: appointmentId,
        occurrence_date: "2026-09-26",
        status: "missed",
      });
      expect(error).toBeNull();
    });
  });

  describe("UPDATE guard (forbidden-transition check)", () => {
    it("rejects done -> planned", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { data } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();
      await walkTransitions(admin, "appointment_occurrence_status", data!.id as string, "status", ["done"]);
      const { error } = await admin
        .from("appointment_occurrence_status")
        .update({ status: "planned" })
        .eq("id", data!.id as string);
      expect(error).not.toBeNull();
    });

    it("rejects missed -> planned", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { data } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();
      await walkTransitions(admin, "appointment_occurrence_status", data!.id as string, "status", ["missed"]);
      const { error } = await admin
        .from("appointment_occurrence_status")
        .update({ status: "planned" })
        .eq("id", data!.id as string);
      expect(error).not.toBeNull();
    });

    it("rejects missed -> done (missed is terminal, same as event_status)", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { data } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();
      await walkTransitions(admin, "appointment_occurrence_status", data!.id as string, "status", ["missed"]);
      const { error } = await admin
        .from("appointment_occurrence_status")
        .update({ status: "done" })
        .eq("id", data!.id as string);
      expect(error).not.toBeNull();
    });

    it("accepts the two legal edges: planned->done, planned->missed", async () => {
      const appointmentId = await createAppointment(admin, userId);

      const { data: doneRow } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();
      const { error: plannedToDoneError } = await admin
        .from("appointment_occurrence_status")
        .update({ status: "done" })
        .eq("id", doneRow!.id as string);
      expect(plannedToDoneError).toBeNull();

      const { data: missedRow } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-10-03" })
        .select("id")
        .single();
      const { error: plannedToMissedError } = await admin
        .from("appointment_occurrence_status")
        .update({ status: "missed" })
        .eq("id", missedRow!.id as string);
      expect(plannedToMissedError).toBeNull();
    });
  });

  describe("unique index + upsert", () => {
    it("rejects a second plain INSERT for the same (appointment_id, occurrence_date)", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { error: firstError } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" });
      expect(firstError).toBeNull();

      const { error: secondError } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" });
      expect(secondError).not.toBeNull();
    });

    it("upserts on (appointment_id, occurrence_date) instead of duplicating a row", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { error: insertError } = await admin
        .from("appointment_occurrence_status")
        .upsert(
          { appointment_id: appointmentId, occurrence_date: "2026-09-26", status: "planned" },
          { onConflict: "appointment_id,occurrence_date" },
        );
      expect(insertError).toBeNull();

      // The write path (Phase 3) upserts planned->done this way, not a plain
      // update -- it doesn't know ahead of time whether a row already exists
      // for this occurrence.
      const { error: upsertError } = await admin
        .from("appointment_occurrence_status")
        .upsert(
          { appointment_id: appointmentId, occurrence_date: "2026-09-26", status: "done" },
          { onConflict: "appointment_id,occurrence_date" },
        );
      expect(upsertError).toBeNull();

      const { data: rows, error: selectError } = await admin
        .from("appointment_occurrence_status")
        .select("id, status")
        .eq("appointment_id", appointmentId)
        .eq("occurrence_date", "2026-09-26");
      expect(selectError).toBeNull();
      expect(rows).toHaveLength(1);
      expect(rows?.[0]?.status).toBe("done");
    });

    it("still rejects a forbidden transition when it arrives via upsert, not a plain UPDATE", async () => {
      // Confirms the UPDATE branch of the guard still fires when ON CONFLICT
      // DO UPDATE is what actually resolves the write (Phase 3's only write
      // path for an existing row) -- the relaxed INSERT branch above must not
      // have accidentally made this table's terminal-status rule unenforceable.
      const appointmentId = await createAppointment(admin, userId);
      const { data: row } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26", status: "missed" })
        .select("id")
        .single();

      const { error } = await admin
        .from("appointment_occurrence_status")
        .upsert(
          { appointment_id: appointmentId, occurrence_date: "2026-09-26", status: "done" },
          { onConflict: "appointment_id,occurrence_date" },
        );
      expect(error).not.toBeNull();

      const { data: unchanged } = await admin
        .from("appointment_occurrence_status")
        .select("status")
        .eq("id", row!.id as string)
        .single();
      expect(unchanged?.status).toBe("missed");
    });

    // The actual regression this whole migration exists to fix: one
    // occurrence's completion must never leak into a different occurrence's
    // displayed status for the same recurring appointment.
    it("a different occurrence date's row stays planned after another occurrence is marked done", async () => {
      const appointmentId = await createAppointment(admin, userId);
      const { data: sept26 } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();
      await admin
        .from("appointment_occurrence_status")
        .update({ status: "done" })
        .eq("id", sept26!.id as string);

      // Oct 3's occurrence has no row at all yet -- absent means planned by
      // convention (resolved in app code, not a DB default row).
      const { data: oct3Rows, error } = await admin
        .from("appointment_occurrence_status")
        .select("id")
        .eq("appointment_id", appointmentId)
        .eq("occurrence_date", "2026-10-03");
      expect(error).toBeNull();
      expect(oct3Rows).toHaveLength(0);
    });
  });

  describe("ownership via appointment_id (RLS has no own user_id column to check)", () => {
    let userA: TestUser;
    let userB: TestUser;
    let appointmentAId: string;

    beforeAll(async () => {
      userA = await createAuthenticatedUser();
      userB = await createAuthenticatedUser();
      appointmentAId = await createAppointment(admin, userA.userId);
    });

    it("lets user A read their own appointment's occurrence-status row", async () => {
      const { data: row } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentAId, occurrence_date: "2026-09-26" })
        .select("id")
        .single();

      const { data, error } = await userA.client
        .from("appointment_occurrence_status")
        .select("id")
        .eq("id", row!.id as string);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("hides user A's occurrence-status row from user B", async () => {
      const { data: row } = await admin
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentAId, occurrence_date: "2026-10-10" })
        .select("id")
        .single();

      const { data, error } = await userB.client
        .from("appointment_occurrence_status")
        .select("id")
        .eq("id", row!.id as string);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("rejects user B inserting an occurrence-status row against user A's appointment", async () => {
      const { error } = await userB.client
        .from("appointment_occurrence_status")
        .insert({ appointment_id: appointmentAId, occurrence_date: "2026-11-01" });
      expect(error).not.toBeNull();
    });
  });
});
