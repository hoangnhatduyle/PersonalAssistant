import { test, expect } from "@playwright/test";
import { createUserAndSignIn } from "./fixtures";

// A full live OAuth round-trip (real Google/Microsoft consent screens) can't
// be automated here — this covers the not-yet-connected state, which is
// what a fresh e2e user always sees (no mail_accounts row exists for them).
test("dashboard shows the Mail card with a Gmail/Outlook tab switcher and Connect CTA", async ({ page }) => {
  await createUserAndSignIn(page);

  const mailGroup = page.getByRole("group", { name: "Mail provider" });
  await expect(mailGroup).toBeVisible();
  await expect(mailGroup.getByRole("button", { name: "Gmail" })).toBeVisible();
  await expect(mailGroup.getByRole("button", { name: "Outlook" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Connect Gmail" })).toBeVisible();

  await mailGroup.getByRole("button", { name: "Outlook" }).click();
  await expect(page.getByRole("link", { name: "Connect Outlook" })).toBeVisible();
});
