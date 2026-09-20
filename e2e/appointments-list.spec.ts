import { expect, test } from "@playwright/test";
import { createAppointment } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

const dateKey = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test.describe("Appointments list: search, past toggle, pagination", () => {
  test("hides past by default, filters as you type, and paginates", async ({ page }) => {
    const user = await createUserAndSignIn(page);

    // 12 upcoming (spans 2 pages of 10) + 2 past. Titles are unique so rows are addressable;
    // past rows are still "planned" (the DB forces that on insert) — past is judged by date/time.
    for (let i = 1; i <= 12; i++) {
      await createAppointment(admin, user.userId, {
        title: `Upcoming ${String(i).padStart(2, "0")}`,
        date: dateKey(i),
        time: "10:00",
        category: i === 5 ? "Career" : "Personal",
        location: i === 5 ? "Zebra Hall" : null,
      });
    }
    await createAppointment(admin, user.userId, { title: "Old Standup", date: dateKey(-3) });
    await createAppointment(admin, user.userId, { title: "Old Workshop", date: dateKey(-2) });

    await page.goto("/calendar");
    const timeline = page.locator("#appointments-timeline");
    const rows = timeline.locator("ul > li");

    // Past hidden by default; page 1 holds 10 of the 12 upcoming.
    await expect(rows).toHaveCount(10);
    await expect(timeline.getByText("Old Standup")).toHaveCount(0);
    await expect(timeline.getByText("Showing 1–10 of 12 appointments")).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Previous" })).toBeDisabled();

    // Next page: the remaining 2, Next disabled.
    await timeline.getByRole("button", { name: "Next" }).click();
    await expect(rows).toHaveCount(2);
    await expect(timeline.getByText("Showing 11–12 of 12 appointments")).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Next" })).toBeDisabled();

    // Searching resets to page 1 and filters live (no submit) — matches a location keyword.
    await timeline.getByRole("searchbox", { name: "Search appointments" }).fill("zebra");
    await expect(rows).toHaveCount(1);
    await expect(timeline.getByText("Upcoming 05")).toBeVisible();
    await expect(timeline.getByRole("navigation", { name: "Pagination" })).toHaveCount(0);

    // A no-match keyword shows the empty state and hints at hidden past rows.
    await timeline.getByRole("searchbox", { name: "Search appointments" }).fill("standup");
    await expect(timeline.getByText("No matching appointments")).toBeVisible();
    await expect(timeline.getByText(/2 hidden/)).toBeVisible();

    // Turning on "Show past" reveals the match.
    await timeline.getByRole("switch", { name: "Show past" }).click();
    await expect(timeline.getByRole("switch", { name: "Show past" })).toHaveAttribute("aria-checked", "true");
    await expect(rows).toHaveCount(1);
    await expect(timeline.getByText("Old Standup")).toBeVisible();

    // Clearing the search with past shown: 14 total across 2 pages.
    await timeline.getByRole("searchbox", { name: "Search appointments" }).fill("");
    await expect(rows).toHaveCount(10);
    await expect(timeline.getByText("Showing 1–10 of 14 appointments")).toBeVisible();
  });
});
