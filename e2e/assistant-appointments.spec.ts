import { expect, test } from "@playwright/test";
import { createAppointment } from "../supabase/tests/helpers";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation } from "./fixtures";

const status = async (id: string) => (await admin.from("appointments").select("event_status").eq("id", id).single()).data?.event_status;

test.describe("assistant: Appointments/Events", () => {
  test("create with full details", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "Add an appointment called Dentist Visit on 2030-04-10 at 3pm for 30 minutes at Downtown Clinic");

    const { data } = await admin
      .from("appointments")
      .select("title, date, time, duration_minutes, location, event_status, deadline_id")
      .eq("user_id", user.userId)
      .is("deleted_at", null);
    expect(data).toHaveLength(1);
    expect(data![0].title.toLowerCase()).toContain("dentist");
    expect(data![0].date).toBe("2030-04-10");
    expect(data![0].duration_minutes).toBe(30);
    expect(data![0].location?.toLowerCase()).toContain("downtown");
    expect(data![0].event_status).toBe("planned");
    expect(data![0].deadline_id).toBeNull();
  });

  test("missing time: assistant asks a follow-up, then remembers the draft when the user answers", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    // No time/duration -> must ask instead of confirming or guessing.
    const question = await askAssistant(page, "Add an appointment called Haircut on 2030-05-02");
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0);
    expect(question).toMatch(/time|when|long|duration/i);
    const { data: none } = await admin.from("appointments").select("id").eq("user_id", user.userId);
    expect(none).toHaveLength(0);

    // The draft is persisted on the conversation row.
    const { data: convo } = await admin.from("voice_conversations").select("draft_mutation").eq("user_id", user.userId).is("ended_at", null).single();
    expect(convo?.draft_mutation).not.toBeNull();

    // Answer only the missing piece: title/date must come from the remembered draft.
    await runMutation(page, "3pm for 45 minutes");
    const { data } = await admin.from("appointments").select("title, date, time, duration_minutes").eq("user_id", user.userId).is("deleted_at", null);
    expect(data).toHaveLength(1);
    expect(data![0].title.toLowerCase()).toContain("haircut");
    expect(data![0].date).toBe("2030-05-02");
    expect(data![0].duration_minutes).toBe(45);

    // Draft cleared once the mutation was proposed.
    const { data: after } = await admin.from("voice_conversations").select("draft_mutation").eq("user_id", user.userId).is("ended_at", null).single();
    expect(after?.draft_mutation).toBeNull();
  });

  test("mark done, mark missed, update, delete", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    const doneId = await createAppointment(admin, user.userId, { title: "Team Standup", date: "2030-06-01", time: "09:00" });
    const missedId = await createAppointment(admin, user.userId, { title: "Yoga Class", date: "2030-06-02", time: "18:00" });
    const editId = await createAppointment(admin, user.userId, { title: "Doctor Checkup", date: "2030-06-03", time: "10:00" });
    const deleteId = await createAppointment(admin, user.userId, { title: "Old Meeting", date: "2030-06-04", time: "11:00" });
    await openAssistant(page);

    await runMutation(page, "Mark my Team Standup appointment as done");
    expect(await status(doneId)).toBe("done");

    await runMutation(page, "I missed my Yoga Class appointment, mark it as missed");
    expect(await status(missedId)).toBe("missed");

    await runMutation(page, "Change the location of my Doctor Checkup appointment to Room 12");
    const { data: edited } = await admin.from("appointments").select("location").eq("id", editId).single();
    expect(edited?.location?.toLowerCase()).toContain("room 12");

    await runMutation(page, "Delete my Old Meeting appointment");
    const { data: deleted } = await admin.from("appointments").select("deleted_at").eq("id", deleteId).single();
    expect(deleted?.deleted_at).not.toBeNull();
    // Untouched ones stay untouched (no wrong-entity "proxy" mutation).
    expect(await status(editId)).toBe("planned");
  });
});
