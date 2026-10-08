import { test, expect } from "@playwright/test";
import { createUserAndSignIn, admin } from "./fixtures";
import { createMailAccount, createMailTriageItem } from "../supabase/tests/helpers";

// A real triage run needs live Gmail/Outlook + OpenAI, which can't be
// automated here. This covers what a fresh user sees (no flagged mail, no
// request fired on load) and the stored-results path using seeded rows.
test("Today shows 'Needs your attention' as an empty card with a Check email button, and never runs a check on load", async ({ page }) => {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/mail/triage")) runs.push(request.url());
  });
  await createUserAndSignIn(page);

  const card = page.getByTestId("email-attention-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("Needs your attention")).toBeVisible();
  await expect(card.getByText(/no flagged emails/i)).toBeVisible();
  await expect(card.getByRole("button", { name: "Check email" })).toBeVisible();

  await card.getByRole("button", { name: "Check email" }).click();
  await expect(card.getByText(/connect gmail or outlook in the mail card first/i)).toBeVisible();
  expect(runs).toEqual([]);
});

test("a stored Needs-action email appears on the card with its reason and can be dismissed", async ({ page }) => {
  const user = await createUserAndSignIn(page);
  const account = await createMailAccount(admin, user.userId);
  await createMailTriageItem(admin, user.userId, account, {
    subject: "Lease renewal due Friday",
    reason: "Asks you to sign by Friday.",
    bucket: "needs_action",
    suggested_action: { kind: "task", title: "Sign the lease" },
  });
  // The seeded account has placeholder tokens; keep the mail card off the network.
  await page.route("**/api/mail/messages**", (route) =>
    route.fulfill({ json: { success: true, data: { connected: true, needsReauth: false, messages: [] }, error: null } }),
  );

  await page.goto("/");
  const card = page.getByTestId("email-attention-card");
  await expect(card.getByText("Lease renewal due Friday")).toBeVisible();
  await expect(card.getByText("Needs action")).toBeVisible();
  await expect(card.getByText("Asks you to sign by Friday.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Add task" })).toBeVisible();

  await card.getByRole("button", { name: "Dismiss Lease renewal due Friday" }).click();
  await expect(card.getByText("Lease renewal due Friday")).toHaveCount(0);

  const { data } = await admin.from("mail_triage_items").select("status").eq("user_id", user.userId);
  expect(data?.map((row) => row.status)).toEqual(["dismissed"]);
});
