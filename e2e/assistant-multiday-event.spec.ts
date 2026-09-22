import { expect, test, type Page } from "@playwright/test";
import { admin, createUserAndSignIn, openAssistant, runMutation } from "./fixtures";

// Production incident (2026-09-22): asked (via voice) to add "blink
// Cincinnati", a festival running October 8th-11th, 7-11pm nightly, the
// assistant created ONE appointment with duration_minutes 5760 (4 days
// inflated into a single block), then a follow-up attempt crashed entirely
// ("propose_mutation must be handled by the calling loop, not dispatched")
// when the model bundled two finalizing tool calls in one turn. Both are
// fixed (duration cap in intent.ts/schemas.ts + system-prompt guidance to
// split into daily appointments; the dispatch-loop fix in
// conversation-core.ts). This test drives the real assistant end-to-end with
// the same request, phrased the messy way real speech-to-text output looks
// (fillers, run-on, no punctuation) rather than a clean written sentence --
// and, since a low-reasoning-effort model doesn't always propose the next
// day outright (sometimes it asks a clarifying question instead, which is a
// SAFE fallback, not a bug), the follow-up loop answers like a real user
// would rather than assuming one fixed script.

/** Sends one turn and reports whether it ended in a mutation confirmation (auto-confirmed) or a plain answer. */
async function sendTurn(page: Page, text: string): Promise<{ kind: "mutation"; prompt: string; result: string } | { kind: "answer"; message: string }> {
  const box = page.getByLabel("Text fallback for voice capture");
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const confirmButton = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(async () => {
    expect((await confirmButton.isVisible()) || (await box.isEnabled())).toBe(true);
  }).toPass({ timeout: 45_000 });

  if (await confirmButton.isVisible()) {
    const prompt = await page.locator("p.text-text-primary").last().innerText();
    await confirmButton.click();
    await expect(confirmButton).toBeHidden({ timeout: 15_000 });
    const result = await page.locator("p.text-text-primary").last().innerText();
    return { kind: "mutation", prompt, result };
  }
  const message = await page.locator("p.text-text-primary").last().innerText();
  return { kind: "answer", message };
}

test.describe("assistant: multi-day event (regression, 2026-09-22 incident)", () => {
  test("a rambling multi-day festival request becomes one appointment per day, never one inflated block, and never crashes on follow-up", async ({ page }) => {
    test.setTimeout(180_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    const appointmentCount = async () => {
      const { data } = await admin.from("appointments").select("id").eq("user_id", user.userId).is("deleted_at", null);
      return data?.length ?? 0;
    };

    // Realistic STT-style transcript: fillers, no punctuation, self-correction.
    const first = await runMutation(
      page,
      "um so i need to add uh blink cincinnati to my calendar its from october eighth through the eleventh and its uh every night from seven to eleven pm",
    );
    expect(first.prompt.toLowerCase()).toMatch(/blink cincinnati/);
    expect(await appointmentCount()).toBe(1);

    // Keep nudging like a real user would, answering any clarifying question
    // it asks rather than assuming a fixed script -- up to a generous cap so
    // a genuinely stuck conversation still fails loudly instead of hanging.
    let lastWasQuestion = false;
    for (let i = 0; i < 8 && (await appointmentCount()) < 4; i++) {
      const nudge = lastWasQuestion
        ? "yes, one appointment per day, 7 to 11 pm, 4 hours each"
        : "yeah go ahead and add the rest too";
      const turn = await sendTurn(page, nudge);
      lastWasQuestion = turn.kind === "answer";
    }

    const { data, error } = await admin
      .from("appointments")
      .select("title, date, time, duration_minutes")
      .eq("user_id", user.userId)
      .is("deleted_at", null)
      .order("date", { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(4);

    // "October eighth" resolves to the next upcoming Oct 8 relative to
    // whenever this test runs (same rule the assistant itself uses for a
    // bare month/day with no year) -- never a hardcoded year, so this stays
    // correct long after 2026.
    const now = new Date();
    let year = now.getFullYear();
    if (now.getUTCMonth() > 9 || (now.getUTCMonth() === 9 && now.getUTCDate() > 8)) year += 1;
    const toKey = (d: Date) => d.toISOString().slice(0, 10);
    const expectedDates = [0, 1, 2, 3].map((offset) => toKey(new Date(Date.UTC(year, 9, 8 + offset))));

    const dates = data!.map((row) => row.date);
    expect(dates).toEqual(expectedDates);

    for (const row of data!) {
      expect(row.title.toLowerCase()).toContain("cincinnati");
      // The bug: a single row with duration_minutes 5760 (4 days). Every
      // row here must be a single evening, never more than 24h.
      expect(row.duration_minutes).toBeLessThanOrEqual(1440);
      expect(row.duration_minutes).toBe(240);
    }
  });
});
