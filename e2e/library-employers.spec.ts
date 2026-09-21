import { expect, test, type Page } from "@playwright/test";
import { createLibraryPost, createPerson } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

/** Drags `source` onto `target` with real mouse events, in steps (dnd-kit needs intermediate moves). */
async function dragTo(page: Page, source: ReturnType<Page["locator"]>, target: ReturnType<Page["locator"]>) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag endpoints are not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();
}

test.describe("Library: employers", () => {
  test("track an employer end to end: role, status, interviews, contacts, linked post, board, cascade delete", async ({ page }) => {
    const user = await createUserAndSignIn(page);
    await createPerson(admin, user.userId, { name: "Recruiter Rae" });
    const postId = await createLibraryPost(admin, user.userId, { title: "Acme is hiring" });

    // --- Tabs + empty state ---------------------------------------------------------------------
    await page.goto("/library");
    await page.getByRole("navigation", { name: "Library sections" }).getByRole("link", { name: "Employers" }).click();
    await expect(page).toHaveURL(/\/library\/employers$/);
    await expect(page.getByText("No employers yet")).toBeVisible();

    // --- Create an employer (lands on its dossier) ------------------------------------------------
    await page.getByRole("button", { name: "Add employer" }).click();
    const employerDialog = page.getByRole("dialog");
    await employerDialog.getByLabel("Name").fill("Acme Corp");
    await employerDialog.getByLabel("Website").fill("https://www.acme.com");
    await employerDialog.getByRole("button", { name: "Add employer" }).click();
    await expect(page).toHaveURL(/\/library\/employers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Acme Corp" })).toBeVisible();
    const employerId = page.url().split("/").pop()!;

    // --- Add a role --------------------------------------------------------------------------------
    await page.getByRole("button", { name: "Add role" }).click();
    const roleDialog = page.getByRole("dialog");
    await roleDialog.getByLabel("Role", { exact: true }).fill("Frontend Engineer");
    await roleDialog.getByLabel("Minimum salary").fill("90000");
    await roleDialog.getByLabel("Maximum salary").fill("120000");
    await roleDialog.getByLabel("Currency").fill("usd");
    await roleDialog.getByLabel("Salary period").selectOption("year");
    await roleDialog.getByRole("button", { name: "Add role" }).click();
    await expect(roleDialog).toBeHidden();
    const rolePanel = page.getByRole("article", { name: "Frontend Engineer" });
    await expect(rolePanel).toBeVisible();
    await expect(rolePanel.getByText("$90K–$120K / yr")).toBeVisible();

    // --- Change status through the select; history shows up in the timeline -----------------------
    await rolePanel.getByLabel("Status for Frontend Engineer").selectOption("applied");
    await expect(rolePanel.getByText("Moved to Applied")).toBeVisible();
    await expect(rolePanel.getByText("Added as Interested")).toBeVisible();

    // --- Log an interview round ---------------------------------------------------------------------
    await rolePanel.getByRole("button", { name: "Add round" }).click();
    const roundDialog = page.getByRole("dialog");
    await roundDialog.getByLabel("Round").fill("Phone screen");
    await roundDialog.getByRole("button", { name: "Add round" }).click();
    await expect(roundDialog).toBeHidden();
    await expect(rolePanel.getByRole("list").getByText("Phone screen").first()).toBeVisible();
    await expect(rolePanel.getByRole("region", { name: "Timeline for Frontend Engineer" }).getByText("Phone screen")).toBeVisible();

    // --- Add a contact from People ------------------------------------------------------------------
    await page.getByLabel("Person to link").selectOption({ label: "Recruiter Rae" });
    await page.getByRole("button", { name: "Link person" }).click();
    await expect(page.getByRole("region", { name: /Contacts/ }).or(page.locator("section", { hasText: "Contacts" })).getByText("Recruiter Rae")).toBeVisible();

    // --- A saved post linked to this employer shows in the dossier ------------------------------------
    await admin.from("library_post_employers").insert({ post_id: postId, employer_id: employerId, user_id: user.userId });
    await page.reload();
    await expect(page.getByRole("link", { name: "Acme is hiring" })).toBeVisible();

    // --- List view: the card reflects the pipeline ------------------------------------------------------
    await page.goto("/library/employers");
    const card = page.locator("article", { hasText: "Acme Corp" });
    await expect(card.getByText("Applied", { exact: true })).toBeVisible();
    await expect(card.getByRole("img", { name: /Stage: Applied/ })).toBeVisible();

    // --- Board: mouse drag between lanes ----------------------------------------------------------------
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board" }).click();
    await expect(page).toHaveURL(/view=board/);
    const applied = page.getByRole("region", { name: "Applied applications" });
    const interviewing = page.getByRole("region", { name: "Interviewing applications" });
    await expect(applied.getByText("Frontend Engineer")).toBeVisible();
    await dragTo(page, applied.locator(".pipeline-card").first(), interviewing);
    await expect(interviewing.getByText("Frontend Engineer")).toBeVisible();
    await expect(applied.getByText("Frontend Engineer")).toHaveCount(0);

    // --- Board: keyboard move (Space, →, Space) ------------------------------------------------------------
    const grip = page.getByRole("button", { name: "Move Frontend Engineer at Acme Corp" });
    await grip.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    // The sensor scrolls the next lane into view; drop only once the screen-reader announcement confirms the target.
    await expect(page.locator("[id^=DndLiveRegion]")).toContainText("Frontend Engineer at Acme Corp is over the Offer stage.");
    await page.keyboard.press("Space");
    await expect(page.getByRole("region", { name: "Offer applications" }).getByText("Frontend Engineer")).toBeVisible();

    // The moves were persisted server-side, and each one left a history event.
    await expect
      .poll(async () => {
        const { data } = await admin.from("library_application_events").select("to_status").eq("user_id", user.userId).order("created_at");
        return data?.map((e) => e.to_status);
      })
      .toEqual(["interested", "applied", "interviewing", "offer"]);

    // --- Delete the employer: the cascade removes its roles ------------------------------------------------
    await page.goto(`/library/employers/${employerId}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete employer" }).click();
    await expect(page).toHaveURL(/\/library\/employers$/);
    await expect(page.getByText("No employers yet")).toBeVisible();

    const { data: apps } = await admin.from("library_applications").select("deleted_at").eq("employer_id", employerId);
    expect(apps?.length).toBe(1);
    expect(apps?.every((a) => a.deleted_at !== null)).toBe(true);
    const { data: links } = await admin.from("library_post_employers").select("post_id").eq("employer_id", employerId);
    expect(links ?? []).toHaveLength(0);
  });

  test("another user cannot see or open someone else's employer", async ({ page, browser }) => {
    const owner = await createUserAndSignIn(page);
    const { data: employer } = await admin.from("library_employers").insert({ user_id: owner.userId, name: "Private Co" }).select("id").single();

    const otherPage = await (await browser.newContext()).newPage();
    await createUserAndSignIn(otherPage);
    await otherPage.goto("/library/employers");
    await expect(otherPage.getByText("Private Co")).toHaveCount(0);
    await otherPage.goto(`/library/employers/${employer!.id}`);
    await expect(otherPage.getByText("Employer not found")).toBeVisible();
    const response = await otherPage.request.get(`/api/library/employers/${employer!.id}`);
    expect(response.status()).toBe(404);
  });
});
