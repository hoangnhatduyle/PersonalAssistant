import { describe, expect, it } from "vitest";
import { adminClient, createAuthenticatedUser, createUserPreferences } from "./helpers";
import { DEFAULT_USER_PREFERENCES } from "../../src/lib/api/entity-types";

// Traces: SPEC-DATA-012 AC-1, AC-3, AC-4, NC-DATA-USERPREFS-001.
describe("user_preferences schema", () => {
  const admin = adminClient();

  it("AC-1/AC-5: a row inserted with only user_id takes its column defaults for everything else", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId);

    const { data, error } = await admin
      .from("user_preferences")
      .select("default_reminder_lead_minutes, quiet_hours_start, quiet_hours_end, timezone, voice_capture_enabled")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      default_reminder_lead_minutes: 60,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: "UTC",
      voice_capture_enabled: true,
    });
  });

  // Architect-review finding: src/app/api/settings/route.ts's GET hand-duplicates
  // these column DEFAULTs (so a read never has to write a row just to learn
  // them) — this test fails the moment that hardcoded copy drifts from what
  // the migration actually defaults to.
  it("DEFAULT_USER_PREFERENCES (route.ts's hand-duplicated copy) matches the migration's real column defaults", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId);

    const { data, error } = await admin
      .from("user_preferences")
      .select("default_reminder_lead_minutes, quiet_hours_start, quiet_hours_end, timezone, voice_capture_enabled")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      default_reminder_lead_minutes: DEFAULT_USER_PREFERENCES.default_reminder_lead_minutes,
      quiet_hours_start: DEFAULT_USER_PREFERENCES.quiet_hours_start,
      quiet_hours_end: DEFAULT_USER_PREFERENCES.quiet_hours_end,
      timezone: DEFAULT_USER_PREFERENCES.timezone,
      voice_capture_enabled: DEFAULT_USER_PREFERENCES.voice_capture_enabled,
    });
  });

  it("NC-DATA-USERPREFS-001: a second row for the same user_id is rejected (unique(user_id))", async () => {
    const user = await createAuthenticatedUser();
    await createUserPreferences(admin, user.userId);

    const { error } = await admin.from("user_preferences").insert({ user_id: user.userId });
    expect(error).not.toBeNull();
  });

  it("AC-3: inserting quiet_hours_start without quiet_hours_end is rejected by the CHECK constraint", async () => {
    const user = await createAuthenticatedUser();
    const { error } = await admin
      .from("user_preferences")
      .insert({ user_id: user.userId, quiet_hours_start: "22:00" });
    expect(error).not.toBeNull();
  });

  it("AC-3: updating to clear only quiet_hours_end (leaving quiet_hours_start set) is rejected", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId, {
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });

    const { error } = await admin.from("user_preferences").update({ quiet_hours_end: null }).eq("id", id);
    expect(error).not.toBeNull();
  });

  it("AC-3: both quiet_hours_start and quiet_hours_end set together is accepted", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId, {
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });

    const { data, error } = await admin
      .from("user_preferences")
      .select("quiet_hours_start, quiet_hours_end")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(data?.quiet_hours_start).toBe("22:00:00");
    expect(data?.quiet_hours_end).toBe("07:00:00");
  });

  it("AC-4: deleting the owning user cascades to delete their user_preferences row", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.userId);
    expect(deleteError).toBeNull();

    const { data, error } = await admin.from("user_preferences").select("id").eq("id", id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("updated_at advances on update", async () => {
    const user = await createAuthenticatedUser();
    const id = await createUserPreferences(admin, user.userId);
    const { data: before } = await admin.from("user_preferences").select("updated_at").eq("id", id).single();

    await new Promise((resolve) => setTimeout(resolve, 10));
    const { error } = await admin.from("user_preferences").update({ voice_capture_enabled: false }).eq("id", id);
    expect(error).toBeNull();

    const { data: after } = await admin.from("user_preferences").select("updated_at").eq("id", id).single();
    expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(new Date(before!.updated_at as string).getTime());
  });
});
