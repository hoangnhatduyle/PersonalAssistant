import { expect, test } from "@playwright/test";
import { admin, askAssistant, createUserAndSignIn, openAssistant, runMutation } from "./fixtures";

// Production incident (2026-09-22): a mutation-proposal turn in session.ts
// never wrote conversation_id, and once confirmed/declined/expired it never
// wrote response_message either -- so loadConversationHistory's own
// .not("response_message", "is", null) filter (deliberate, to hide a still-
// pending mutation) permanently and silently erased EVERY resolved mutation
// turn from history. The model then had zero memory it had ever proposed
// that action -- only the live entity-context snapshot to infer an ambiguous
// follow-up from, which happens to work when the referenced entity exists
// and is unambiguous, but fails when nothing was ever created (a DECLINED
// proposal leaves no row behind at all) or when the connection genuinely
// requires remembering what was just said. Fixed in session.ts
// (conversation_id set at proposal time, response_message set on
// confirm/decline/expire) and covered at the unit level in session.test.ts.
//
// This incident was originally found through a multi-day-event follow-up
// phrase, but that specific reproduction is now moot: the multi-day chain no
// longer asks the model to interpret any follow-up at all (see
// assistant-multiday-event.spec.ts's additional_steps mechanism -- zero
// further LLM calls between days). The underlying bug this file guards is
// general to any resolved voice mutation, so it needs its own scenario, one
// where the live entity snapshot genuinely cannot substitute for real
// conversation memory.
test.describe("assistant: conversation memory across resolved mutation turns (regression, 2026-09-22 incident)", () => {
  test("a declined proposal is still remembered by a later ambiguous follow-up", async ({ page }) => {
    test.setTimeout(90_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    const box = page.getByLabel("Text fallback for voice capture");
    await expect(box).toBeEnabled();
    await box.fill("add a task to call the bank about the loan");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const declineButton = page.getByRole("button", { name: "Decline", exact: true });
    await expect(declineButton, "expected a confirmation prompt for the task proposal").toBeVisible({ timeout: 45_000 });
    await declineButton.click();
    await expect(declineButton).toBeHidden({ timeout: 15_000 });

    // Nothing was created -- the live entity-context snapshot has nothing to
    // fall back on here, so a coherent reply below can only come from
    // conversation history genuinely remembering the declined proposal.
    const { data: tasksAfterDecline } = await admin.from("tasks").select("id").eq("user_id", user.userId).is("deleted_at", null);
    expect(tasksAfterDecline ?? []).toHaveLength(0);

    const reply = await askAssistant(page, "wait, what was that task you just suggested?");
    expect(reply.toLowerCase()).toMatch(/bank|loan/);
  });

  test("a confirmed proposal's own content is remembered by a later ambiguous follow-up", async ({ page }) => {
    test.setTimeout(90_000);
    const user = await createUserAndSignIn(page);
    await openAssistant(page);

    await runMutation(page, "add a task to call the bank about the loan");

    const reply = await askAssistant(page, "what did you just add for me?");
    expect(reply.toLowerCase()).toMatch(/bank|loan/);

    const { data: tasks } = await admin.from("tasks").select("title").eq("user_id", user.userId).is("deleted_at", null);
    expect((tasks ?? []).some((t) => t.title.toLowerCase().includes("bank"))).toBe(true);
  });
});
