import { expect, test } from "@playwright/test";
import { admin, createUserAndSignIn, openAssistant, runMutationChain } from "./fixtures";

// Production incident (2026-09-22): asked (via voice) to add "blink
// Cincinnati", a festival running October 8th-11th, 7-11pm nightly, the
// assistant created ONE appointment with duration_minutes 5760 (4 days
// inflated into a single block), then a follow-up attempt crashed entirely
// ("propose_mutation must be handled by the calling loop, not dispatched")
// when the model bundled two finalizing tool calls in one turn. The
// duration/split fix (duration cap in intent.ts/schemas.ts, one Appointment
// per day) and dispatch-loop fix both shipped the same day, but the
// continuation model at the time still required the user to re-prompt
// ("add the rest too") after every single day, relying on the LLM correctly
// interpreting an ambiguous follow-up each time -- itself a second source of
// fragility (a misfire was reproduced against the exact reported phrase).
//
// That nudge-loop mechanism is now replaced by a general, deterministic
// multi-step command queue (Workstream C, general/plan swirling-beaming-
// nautilus.md): propose_mutation's `additional_steps` field carries every
// remaining action, fully resolved, in one turn -- the backend pops the next
// step and proposes it automatically once the previous one is confirmed,
// with NO further LLM call and NO further user utterance. This file drives
// that mechanism end-to-end with the same real, messy STT-style transcript
// the original incident report used.

test.describe("assistant: multi-day event (regression, 2026-09-22 incident) + general multi-step queue", () => {
  test("a rambling multi-day festival request becomes one appointment per day, chained via additional_steps with zero further user utterances", async ({ page }) => {
    test.setTimeout(120_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    // Realistic STT-style transcript: fillers, no punctuation, self-correction.
    // Submitted exactly once -- every subsequent confirmation prompt below
    // must come from the server's own queued-step continuation, never from
    // another text submission.
    const { prompts, result } = await runMutationChain(
      page,
      "um so i need to add uh blink cincinnati to my calendar its from october eighth through the eleventh and its uh every night from seven to eleven pm",
    );

    expect(prompts).toHaveLength(4);
    for (const prompt of prompts) {
      expect(prompt.toLowerCase()).toMatch(/blink cincinnati/);
    }
    // General session close-out (Workstream C4): once the queue drains with
    // nothing left, the final response invites the next command.
    expect(result.toLowerCase()).toMatch(/anything else/);

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

  // Proves the chain advances structurally -- appointment count growing by
  // exactly one after each bare Confirm click, with the text box touched
  // only once for the whole test -- rather than proving an ambiguous nudge
  // phrase happened to get interpreted correctly (the old test 2, and
  // exactly the fragility this mechanism removes: there is no longer any
  // follow-up utterance for the model to misinterpret).
  test("the chain advances through every remaining day via Confirm clicks alone, with zero additional user utterances after the first", async ({ page }) => {
    test.setTimeout(90_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    const appointmentCount = async () => {
      const { data } = await admin.from("appointments").select("id").eq("user_id", user.userId).is("deleted_at", null);
      return data?.length ?? 0;
    };

    const box = page.getByLabel("Text fallback for voice capture");
    const confirmButton = page.getByRole("button", { name: "Confirm", exact: true });

    await expect(box).toBeEnabled();
    await box.fill("I need to create an event called Plink Cincinnati that is happening on October 8 to October 11, 7PM to 11PM every day.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(confirmButton, "expected the first day's confirmation prompt").toBeVisible({ timeout: 45_000 });

    for (let day = 1; day <= 4; day++) {
      const prompt = await page.locator("p.text-text-primary").last().innerText();
      expect(prompt.toLowerCase()).toMatch(/plink cincinnati/);

      await confirmButton.click();

      if (day < 4) {
        // Chain continues: a NEW confirmation prompt for the next day
        // appears on its own -- no text submitted, no mic turn taken.
        await expect(async () => {
          expect(await confirmButton.isVisible()).toBe(true);
          const nextPrompt = await page.locator("p.text-text-primary").last().innerText();
          expect(nextPrompt).not.toBe(prompt);
        }).toPass({ timeout: 15_000 });
      } else {
        // Last day: the queue is empty, so this is terminal.
        await expect(confirmButton).toBeHidden({ timeout: 15_000 });
      }

      await expect.poll(appointmentCount, { timeout: 15_000 }).toBe(day);
    }

    // The text box was submitted exactly once for this entire test (the
    // fill()/click() pair above, before the loop) -- everything after that
    // was Confirm clicks alone.
    const { data } = await admin
      .from("appointments")
      .select("title, date, duration_minutes")
      .eq("user_id", user.userId)
      .is("deleted_at", null)
      .order("date", { ascending: true });
    expect(data).toHaveLength(4);
    for (const row of data!) {
      expect(row.title.toLowerCase()).toContain("cincinnati");
      expect(row.duration_minutes).toBe(240);
    }
  });

  // additional_steps is a fully general mechanism, not an Event-specific
  // "date series" -- this proves a compound, heterogeneous, non-event
  // request (two distinct Task creates named in one breath) chains its
  // second confirmation automatically too, matching conversation-core.ts's
  // own worked example for this exact phrase.
  test("a compound non-event request ('add a task ... and remind me to ...') chains a second confirmation automatically", async ({ page }) => {
    test.setTimeout(60_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    const { prompts, result } = await runMutationChain(page, "add a task to buy milk and remind me to call mom");

    expect(prompts).toHaveLength(2);
    expect(prompts[0].toLowerCase()).toMatch(/milk/);
    expect(prompts[1].toLowerCase()).toMatch(/mom/);
    expect(result.toLowerCase()).toMatch(/anything else/);

    const { data: tasks } = await admin.from("tasks").select("title").eq("user_id", user.userId).is("deleted_at", null);
    const titles = (tasks ?? []).map((t) => t.title.toLowerCase());
    expect(titles.some((title) => title.includes("milk"))).toBe(true);
    expect(titles.some((title) => title.includes("mom"))).toBe(true);
  });
});
