import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { createLibraryPost } from "../supabase/tests/helpers";
import { admin, createUserAndSignIn } from "./fixtures";

async function screenshot(color: string, width = 600, height = 400): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return { name: `shot-${color.replace("#", "")}.png`, mimeType: "image/png", buffer };
}

async function savePost(page: Page, fields: { title: string; url?: string; notes?: string; tag?: string }, shots: Awaited<ReturnType<typeof screenshot>>[] = []) {
  await page.getByRole("button", { name: "Save a post" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(fields.title);
  if (fields.url) await dialog.getByLabel("Link (optional)").fill(fields.url);
  if (fields.notes) await dialog.getByLabel("Notes").fill(fields.notes);
  if (fields.tag) {
    await dialog.getByPlaceholder("Add a tag…").fill(fields.tag);
    await dialog.getByPlaceholder("Add a tag…").press("Enter");
  }
  if (shots.length > 0) await dialog.locator("input[type=file]").setInputFiles(shots);
  await dialog.getByRole("button", { name: "Save post" }).click();
}

test.describe("Library: saved posts", () => {
  test("save with screenshots, search, filter, favorite/archive, dedupe, delete, and isolation", async ({ page, browser }) => {
    const user = await createUserAndSignIn(page);

    await page.goto("/library");
    await expect(page.getByText("Nothing saved yet")).toBeVisible();

    // --- Create a post with two screenshots -------------------------------------------------
    await savePost(
      page,
      { title: "React hooks explained", url: "https://www.instagram.com/p/ABC123/?igsh=xyz", notes: "100% worth a rewatch", tag: "react" },
      [await screenshot("#cc3333"), await screenshot("#3366cc", 1200, 2400)],
    );
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "React hooks explained" })).toBeVisible();

    // The cover renders through the signed-URL redirect route.
    const cover = page.locator("article", { hasText: "React hooks explained" }).locator("img").first();
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // --- Seed a second post directly, then filter -------------------------------------------
    await createLibraryPost(admin, user.userId, {
      title: "Quick pasta night",
      platform: "facebook",
      url: "https://facebook.com/cook/posts/1",
      normalized_url: "https://facebook.com/cook/posts/1",
      tags: ["food"],
    });
    await page.reload();
    await expect(page.getByRole("link", { name: "Quick pasta night" })).toBeVisible();
    await expect(page.getByRole("link", { name: "React hooks explained" })).toBeVisible();

    // Live search (no submit): literal % matches only the post with "100%" in its notes.
    const search = page.getByRole("searchbox", { name: "Search saved posts" });
    await search.fill("100%");
    await expect(page.getByRole("link", { name: "Quick pasta night" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "React hooks explained" })).toBeVisible();
    await expect(page).toHaveURL(/q=100/);
    await search.fill("nothing-matches-this");
    await expect(page.getByText("No posts match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();

    // Platform + tag filters.
    await page.getByRole("group", { name: "Platform" }).getByRole("button", { name: "Facebook" }).click();
    await expect(page.getByRole("link", { name: "Quick pasta night" })).toBeVisible();
    await expect(page.getByRole("link", { name: "React hooks explained" })).toHaveCount(0);
    await page.getByRole("group", { name: "Platform" }).getByRole("button", { name: "All" }).click();
    await page.getByRole("group", { name: "Tags" }).getByRole("button", { name: /react/ }).click();
    await expect(page.getByRole("link", { name: "Quick pasta night" })).toHaveCount(0);
    await page.getByRole("group", { name: "Tags" }).getByRole("button", { name: /react/ }).click();

    // --- Duplicate URL (same post, different tracking params) shows the 409 message ---------
    await savePost(page, { title: "Same reel again", url: "https://instagram.com/p/ABC123/?utm_source=x" });
    await expect(page.getByText(/Already saved/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open it" })).toHaveAttribute("href", /\/library\/posts\/.+/);
    await page.getByRole("button", { name: "Cancel" }).click();

    // --- Detail page: gallery, favorite, archive ---------------------------------------------
    await page.getByRole("link", { name: "React hooks explained" }).click();
    await expect(page).toHaveURL(/\/library\/posts\//);
    await expect(page.getByRole("heading", { level: 1, name: "React hooks explained" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open original on instagram.com/ })).toHaveAttribute("rel", "noopener noreferrer");

    const gallery = page.getByRole("region", { name: /Screenshots of React hooks explained/ });
    const big = gallery.getByRole("group").locator("img");
    await expect.poll(() => big.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await gallery.getByRole("group").focus();
    await page.keyboard.press("ArrowRight");
    await expect(gallery.getByRole("group")).toHaveAttribute("aria-label", "Screenshot 2 of 2");

    const { data: imageRows } = await admin.from("library_post_images").select("id").eq("user_id", user.userId).limit(1);
    const imageId = imageRows![0].id as string;

    await page.getByRole("switch", { name: "Favorite" }).click();
    await expect(page.getByRole("switch", { name: "Favorite" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unarchive" })).toBeVisible();

    // Archived posts drop out of the default list and appear under "Only archived".
    await page.goto("/library");
    await expect(page.getByRole("link", { name: "React hooks explained" })).toHaveCount(0);
    await page.getByLabel("Archived posts").selectOption("only");
    await expect(page.getByRole("link", { name: "React hooks explained" })).toBeVisible();

    // --- Isolation: another user gets 404 on this user's image -------------------------------
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await createUserAndSignIn(otherPage);
    const foreign = await otherPage.request.get(`/api/library/post-images/${imageId}/file?size=thumb`, { maxRedirects: 0 });
    expect(foreign.status()).toBe(404);
    // ...while the owner is redirected to a signed Storage URL.
    const own = await page.request.get(`/api/library/post-images/${imageId}/file?size=thumb`, { maxRedirects: 0 });
    expect(own.status()).toBe(302);
    await otherContext.close();

    // --- Delete -------------------------------------------------------------------------------
    await page.getByRole("link", { name: "React hooks explained" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete post" }).click();
    await expect(page).toHaveURL(/\/library(\?.*)?$/);
    await page.getByLabel("Archived posts").selectOption("all");
    await expect(page.getByRole("link", { name: "React hooks explained" })).toHaveCount(0);
    // A deleted post's image no longer resolves, and its URL can be saved again.
    const gone = await page.request.get(`/api/library/post-images/${imageId}/file?size=thumb`, { maxRedirects: 0 });
    expect(gone.status()).toBe(404);
  });
});
