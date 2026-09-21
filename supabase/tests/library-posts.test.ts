// @vitest-environment node
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { LIBRARY_POST_IMAGE_BUCKET } from "@/lib/library/constants";
import { addImage, deleteImage, getImageSignedUrl } from "@/lib/library/server/post-images";
import { createPost, getPost, listPosts, listTagCounts, softDeletePost, updatePost } from "@/lib/library/server/posts";
import { adminClient, createAuthenticatedUser, createCourse, createLibraryEmployer, createLibraryPost, createPerson, type TestUser } from "./helpers";

type Client = SupabaseClient<Database>;
const typed = (user: TestUser) => user.client as unknown as Client;

async function png(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } }).png().toBuffer();
}

// Traces: supabase/migrations/0038_library_posts.sql, 0039_library_posts_storage.sql.
describe("library posts — schema, RLS and guards", () => {
  const admin = adminClient();
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createAuthenticatedUser();
    bob = await createAuthenticatedUser();
  });

  it("isolates posts between users (RLS select)", async () => {
    const postId = await createLibraryPost(admin, alice.userId, { title: "alice only" });

    const { data: own } = await alice.client.from("library_posts").select("id").eq("id", postId);
    expect(own).toHaveLength(1);
    const { data: other } = await bob.client.from("library_posts").select("id").eq("id", postId);
    expect(other ?? []).toHaveLength(0);
  });

  it("rejects inserting a post for another user", async () => {
    const { error } = await bob.client.from("library_posts").insert({ user_id: alice.userId, title: "spoof" });
    expect(error).not.toBeNull();
  });

  it("has no client hard delete (no DELETE policy)", async () => {
    const postId = await createLibraryPost(admin, alice.userId);
    await alice.client.from("library_posts").delete().eq("id", postId);
    const { data } = await admin.from("library_posts").select("id").eq("id", postId);
    expect(data ?? []).toHaveLength(1);
  });

  it("active_library_posts excludes soft-deleted rows", async () => {
    const postId = await createLibraryPost(admin, alice.userId);
    await admin.from("library_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
    const { data } = await admin.from("active_library_posts").select("id").eq("id", postId);
    expect(data ?? []).toHaveLength(0);
  });

  it("enforces title length, url scheme, platform and the url/normalized_url pairing", async () => {
    const bad = async (row: Record<string, unknown>) =>
      (await admin.from("library_posts").insert({ user_id: alice.userId, title: "t", ...row })).error;
    expect(await bad({ title: "" })).not.toBeNull();
    expect(await bad({ title: "x".repeat(201) })).not.toBeNull();
    expect(await bad({ url: "javascript:alert(1)", normalized_url: "x" })).not.toBeNull();
    expect(await bad({ platform: "myspace" })).not.toBeNull();
    expect(await bad({ url: "https://a.com/x" })).not.toBeNull(); // url without normalized_url
    expect(await bad({ normalized_url: "https://a.com/x" })).not.toBeNull();
  });

  it("enforces one live post per (user, normalized_url) and frees it after soft-delete", async () => {
    const normalized = `https://instagram.com/p/${crypto.randomUUID()}`;
    const first = await createLibraryPost(admin, alice.userId, { url: normalized, normalized_url: normalized });

    const { error: dup } = await admin
      .from("library_posts")
      .insert({ user_id: alice.userId, title: "dup", url: normalized, normalized_url: normalized });
    expect(dup?.code).toBe("23505");

    // another user may save the same URL
    const { error: otherUser } = await admin
      .from("library_posts")
      .insert({ user_id: bob.userId, title: "bob's", url: normalized, normalized_url: normalized });
    expect(otherUser).toBeNull();

    await admin.from("library_posts").update({ deleted_at: new Date().toISOString() }).eq("id", first);
    const { error: again } = await admin
      .from("library_posts")
      .insert({ user_id: alice.userId, title: "again", url: normalized, normalized_url: normalized });
    expect(again).toBeNull();
  });

  describe("link tables", () => {
    it("guard rejects linking another user's person or course", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const bobPerson = await createPerson(admin, bob.userId);
      const bobCourse = await createCourse(admin, bob.userId);

      const person = await admin.from("library_post_people").insert({ post_id: postId, person_id: bobPerson, user_id: alice.userId });
      expect(person.error?.message).toMatch(/people row owned/);
      const course = await admin.from("library_post_courses").insert({ post_id: postId, course_id: bobCourse, user_id: alice.userId });
      expect(course.error?.message).toMatch(/courses row owned/);
    });

    it("sync_* replaces the link set atomically", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const p1 = await createPerson(admin, alice.userId, { name: "P1" });
      const p2 = await createPerson(admin, alice.userId, { name: "P2" });
      const c1 = await createCourse(admin, alice.userId);

      expect((await alice.client.rpc("sync_library_post_people", { p_post_id: postId, p_person_ids: [p1, p2, p1] })).error).toBeNull();
      expect((await alice.client.rpc("sync_library_post_courses", { p_post_id: postId, p_course_ids: [c1] })).error).toBeNull();
      let { data } = await alice.client.from("library_post_people").select("person_id").eq("post_id", postId);
      expect(data?.map((r) => r.person_id).sort()).toEqual([p1, p2].sort());

      await alice.client.rpc("sync_library_post_people", { p_post_id: postId, p_person_ids: [p2] });
      ({ data } = await alice.client.from("library_post_people").select("person_id").eq("post_id", postId));
      expect(data?.map((r) => r.person_id)).toEqual([p2]);

      await alice.client.rpc("sync_library_post_people", { p_post_id: postId, p_person_ids: [] });
      ({ data } = await alice.client.from("library_post_people").select("person_id").eq("post_id", postId));
      expect(data ?? []).toHaveLength(0);
    });

    it("sync_* refuses another user's post", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const { error } = await bob.client.rpc("sync_library_post_people", { p_post_id: postId, p_person_ids: [] });
      expect(error?.message).toMatch(/not found/);
    });

    it("hides link rows from other users (RLS)", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const person = await createPerson(admin, alice.userId);
      await admin.from("library_post_people").insert({ post_id: postId, person_id: person, user_id: alice.userId });
      const { data } = await bob.client.from("library_post_people").select("post_id").eq("post_id", postId);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("images table + guard", () => {
    const imageRow = (postId: string, userId: string, n: number) => ({
      user_id: userId,
      post_id: postId,
      storage_path: `${userId}/${crypto.randomUUID()}-${n}.webp`,
      thumb_path: `${userId}/${crypto.randomUUID()}-${n}.thumb.webp`,
      mime_type: "image/webp",
      width: 10,
      height: 10,
      size_bytes: 1,
      position: n,
    });

    it("rejects an image on another user's post", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const { error } = await admin.from("library_post_images").insert(imageRow(postId, bob.userId, 0));
      expect(error?.message).toMatch(/library_posts row owned/);
    });

    it("rejects the 11th live image but allows one after a soft-delete", async () => {
      const postId = await createLibraryPost(admin, alice.userId);
      const ids: string[] = [];
      for (let n = 0; n < 10; n++) {
        const { data, error } = await admin.from("library_post_images").insert(imageRow(postId, alice.userId, n)).select("id").single();
        expect(error).toBeNull();
        ids.push(data!.id);
      }
      const eleventh = await admin.from("library_post_images").insert(imageRow(postId, alice.userId, 10));
      expect(eleventh.error?.message).toMatch(/at most 10/);

      await admin.from("library_post_images").update({ deleted_at: new Date().toISOString() }).eq("id", ids[0]);
      expect((await admin.from("library_post_images").insert(imageRow(postId, alice.userId, 11))).error).toBeNull();
    });
  });

  describe("tag counts + filters", () => {
    it("library_post_tag_counts counts only the caller's live posts", async () => {
      const carol = await createAuthenticatedUser();
      await createLibraryPost(admin, carol.userId, { tags: ["ai", "career"] });
      await createLibraryPost(admin, carol.userId, { tags: ["ai"] });
      const deleted = await createLibraryPost(admin, carol.userId, { tags: ["ai", "ghost"] });
      await admin.from("library_posts").update({ deleted_at: new Date().toISOString() }).eq("id", deleted);
      await createLibraryPost(admin, alice.userId, { tags: ["ai", "alice-only"] });

      expect(await listTagCounts(typed(carol))).toEqual([
        { tag: "ai", n: 2 },
        { tag: "career", n: 1 },
      ]);
    });

    it("tags @> filter is AND across tags", async () => {
      const dave = await createAuthenticatedUser();
      const both = await createLibraryPost(admin, dave.userId, { tags: ["a", "b"] });
      await createLibraryPost(admin, dave.userId, { tags: ["a"] });
      const { data } = await dave.client.from("library_posts").select("id").contains("tags", ["a", "b"]);
      expect(data?.map((r) => r.id)).toEqual([both]);
    });
  });
});

describe("library posts — server services", () => {
  const admin = adminClient();
  let user: TestUser;
  let other: TestUser;
  let client: Client;

  beforeAll(async () => {
    user = await createAuthenticatedUser();
    other = await createAuthenticatedUser();
    client = typed(user);
  });

  it("createPost derives platform + normalized_url, links people/courses, and returns relations", async () => {
    const personId = await createPerson(admin, user.userId, { name: "Linked" });
    const courseId = await createCourse(admin, user.userId, { name: "Course", code: "C1" });

    const result = await createPost(client, user.userId, {
      title: "Reel about hooks",
      url: "https://www.instagram.com/reel/AbC123/?igsh=zzz",
      tags: ["react"],
      person_ids: [personId],
      course_ids: [courseId],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.post).toMatchObject({
      platform: "instagram",
      normalized_url: "https://instagram.com/reel/AbC123",
      tags: ["react"],
      images: [],
      people: [{ id: personId, name: "Linked" }],
      courses: [{ id: courseId, name: "Course", code: "C1" }],
    });
  });

  it("createPost returns a conflict with the existing id for a duplicate URL", async () => {
    const url = `https://example.com/${crypto.randomUUID()}`;
    const first = await createPost(client, user.userId, { title: "one", url });
    const second = await createPost(client, user.userId, { title: "two", url: `${url}?utm_source=x` });
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "conflict", existingId: first.ok ? first.post.id : null });
  });

  it("createPost 404s (link_not_found) on another user's person and creates nothing", async () => {
    const foreign = await createPerson(admin, other.userId);
    const title = `orphan-${crypto.randomUUID()}`;
    const result = await createPost(client, user.userId, { title, person_ids: [foreign] });
    expect(result).toEqual({ ok: false, reason: "link_not_found" });
    const { data } = await admin.from("library_posts").select("id").eq("title", title);
    expect(data ?? []).toHaveLength(0);
  });

  it("allows a screenshot-only post (no url)", async () => {
    const result = await createPost(client, user.userId, { title: "just a screenshot" });
    expect(result.ok && result.post).toMatchObject({ url: null, normalized_url: null, platform: "other" });
  });

  it("updatePost recomputes url columns, clears with null, toggles archive, and syncs links only when provided", async () => {
    const personId = await createPerson(admin, user.userId);
    const created = await createPost(client, user.userId, { title: "t", person_ids: [personId] });
    if (!created.ok) throw new Error("setup");
    const id = created.post.id;

    const withUrl = await updatePost(client, user.userId, id, { url: "https://m.facebook.com/story.php?story_fbid=1&id=2&ref=x" });
    expect(withUrl.ok && withUrl.post).toMatchObject({ platform: "facebook", normalized_url: "https://facebook.com/story.php?id=2&story_fbid=1" });
    expect(withUrl.ok && withUrl.post.people).toHaveLength(1); // links untouched

    const cleared = await updatePost(client, user.userId, id, { url: null });
    expect(cleared.ok && cleared.post).toMatchObject({ url: null, normalized_url: null, platform: "other" });

    const archived = await updatePost(client, user.userId, id, { archived: true });
    expect(archived.ok && archived.post.archived_at).not.toBeNull();
    const unarchived = await updatePost(client, user.userId, id, { archived: false });
    expect(unarchived.ok && unarchived.post.archived_at).toBeNull();

    const unlinked = await updatePost(client, user.userId, id, { person_ids: [] });
    expect(unlinked.ok && unlinked.post.people).toEqual([]);
  });

  it("updatePost is not_found for another user's post", async () => {
    const created = await createPost(client, user.userId, { title: "mine" });
    if (!created.ok) throw new Error("setup");
    expect(await updatePost(typed(other), other.userId, created.post.id, { title: "hijack" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("drops a soft-deleted person's link at read time (embed + mapPostRow) without touching the person cascade", async () => {
    const personId = await createPerson(admin, user.userId, { name: "Soon gone" });
    const created = await createPost(client, user.userId, { title: "linked to soon-gone", person_ids: [personId] });
    if (!created.ok) throw new Error("setup");

    await admin.from("people").update({ deleted_at: new Date().toISOString() }).eq("id", personId);
    const post = await getPost(client, user.userId, created.post.id);
    expect(post?.people).toEqual([]);
    // the link row itself is untouched — Library never edits soft_delete_person_cascade
    const { data } = await admin.from("library_post_people").select("person_id").eq("post_id", created.post.id);
    expect(data).toHaveLength(1);
  });

  describe("employer links (Phase 2)", () => {
    it("createPost links employers and returns them; updatePost syncs only when provided", async () => {
      const e1 = await createLibraryEmployer(admin, user.userId, { name: `Acme ${crypto.randomUUID()}` });
      const e2 = await createLibraryEmployer(admin, user.userId, { name: `Globex ${crypto.randomUUID()}` });
      const created = await createPost(client, user.userId, { title: "employer post", employer_ids: [e1, e2] });
      if (!created.ok) throw new Error("setup");
      expect(created.post.employers.map((e) => e.id).sort()).toEqual([e1, e2].sort());

      const retitled = await updatePost(client, user.userId, created.post.id, { title: "renamed" });
      expect(retitled.ok && retitled.post.employers).toHaveLength(2); // links untouched

      const trimmed = await updatePost(client, user.userId, created.post.id, { employer_ids: [e2] });
      expect(trimmed.ok && trimmed.post.employers.map((e) => e.id)).toEqual([e2]);
    });

    it("404s (link_not_found) on another user's employer and creates nothing", async () => {
      const foreign = await createLibraryEmployer(admin, other.userId);
      const title = `orphan-${crypto.randomUUID()}`;
      expect(await createPost(client, user.userId, { title, employer_ids: [foreign] })).toEqual({ ok: false, reason: "link_not_found" });
      expect((await admin.from("library_posts").select("id").eq("title", title)).data ?? []).toHaveLength(0);
    });

    it("drops a soft-deleted employer at read time, and listPosts filters by employerId", async () => {
      const live = await createLibraryEmployer(admin, user.userId, { name: `Live ${crypto.randomUUID()}` });
      const doomed = await createLibraryEmployer(admin, user.userId, { name: `Doomed ${crypto.randomUUID()}` });
      const linked = await createPost(client, user.userId, { title: "linked to both", employer_ids: [live, doomed] });
      const unlinked = await createPost(client, user.userId, { title: "not linked to employers" });
      if (!linked.ok || !unlinked.ok) throw new Error("setup");

      const byEmployer = await listPosts(client, user.userId, { employerId: live });
      expect(byEmployer.rows.map((r) => r.id)).toEqual([linked.post.id]);
      expect(byEmployer.total).toBe(1);

      await admin.from("library_employers").update({ deleted_at: new Date().toISOString() }).eq("id", doomed);
      const reread = await getPost(client, user.userId, linked.post.id);
      expect(reread?.employers.map((e) => e.id)).toEqual([live]);
    });
  });

  describe("listPosts", () => {
    let u: TestUser;
    let c: Client;
    let hooksId: string;
    let personId: string;

    beforeAll(async () => {
      u = await createAuthenticatedUser();
      c = typed(u);
      personId = await createPerson(admin, u.userId, { name: "Ann" });
      const a = await createPost(c, u.userId, { title: "React hooks explained", notes: "100% useful, (really)", tags: ["react", "web"], is_favorite: true, url: "https://instagram.com/p/AAA", person_ids: [personId] });
      const b = await createPost(c, u.userId, { title: "Cooking, quick", notes: "pasta_carbonara", tags: ["food"], url: "https://facebook.com/x/posts/1" });
      const d = await createPost(c, u.userId, { title: "Archived thing", tags: ["react"], author_name: "Someone Else" });
      if (!a.ok || !b.ok || !d.ok) throw new Error("setup");
      hooksId = a.post.id;
      await updatePost(c, u.userId, d.post.id, { archived: true });
    });

    it("excludes archived by default; archived=only / all switch it", async () => {
      expect((await listPosts(c, u.userId, {})).total).toBe(2);
      expect((await listPosts(c, u.userId, { archived: "only" })).rows.map((r) => r.title)).toEqual(["Archived thing"]);
      expect((await listPosts(c, u.userId, { archived: "all" })).total).toBe(3);
    });

    it("filters by platform, favorite, tags (AND), person", async () => {
      expect((await listPosts(c, u.userId, { platform: "facebook" })).rows.map((r) => r.title)).toEqual(["Cooking, quick"]);
      expect((await listPosts(c, u.userId, { favorite: true })).rows.map((r) => r.id)).toEqual([hooksId]);
      expect((await listPosts(c, u.userId, { tags: ["react", "web"] })).rows.map((r) => r.id)).toEqual([hooksId]);
      expect((await listPosts(c, u.userId, { personId })).rows.map((r) => r.id)).toEqual([hooksId]);
    });

    it("search: every token must match; wildcards, commas and parentheses are literal", async () => {
      const titles = async (q: string) => (await listPosts(c, u.userId, { q, archived: "all" })).rows.map((r) => r.title);
      expect(await titles("react hooks")).toEqual(["React hooks explained"]);
      expect(await titles("hooks pasta")).toEqual([]);
      expect(await titles("100%")).toEqual(["React hooks explained"]);
      expect(await titles("%")).toEqual(["React hooks explained"]); // literal %, not "match everything"
      expect(await titles("pasta_carb")).toEqual(["Cooking, quick"]);
      expect(await titles("p_sta")).toEqual([]); // _ is literal, not a single-char wildcard
      expect(await titles("(really)")).toEqual(["React hooks explained"]);
      expect(await titles("cooking,")).toEqual(["Cooking, quick"]);
      expect(await titles("someone else")).toEqual(["Archived thing"]); // author_name
      expect(await titles("instagram.com")).toEqual(["React hooks explained"]); // url
    });

    it("paginates with an exact total", async () => {
      const page1 = await listPosts(c, u.userId, { archived: "all", limit: 2, page: 1 });
      const page2 = await listPosts(c, u.userId, { archived: "all", limit: 2, page: 2 });
      expect(page1).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(page1.rows).toHaveLength(2);
      expect(page2.rows).toHaveLength(1);
    });

    it("never returns another user's posts", async () => {
      expect((await listPosts(typed(other), other.userId, { q: "hooks" })).rows.map((r) => r.id)).not.toContain(hooksId);
    });
  });

  it("softDeletePost hides the post and reports whether it existed", async () => {
    const created = await createPost(client, user.userId, { title: "bye" });
    if (!created.ok) throw new Error("setup");
    expect(await softDeletePost(typed(other), other.userId, created.post.id)).toBe(false);
    expect(await softDeletePost(client, user.userId, created.post.id)).toBe(true);
    expect(await getPost(client, user.userId, created.post.id)).toBeNull();
    expect(await softDeletePost(client, user.userId, created.post.id)).toBe(false);
  });

  describe("images (Storage)", () => {
    it("uploads full + thumb objects, inserts an ordered row, and signs a URL", async () => {
      const created = await createPost(client, user.userId, { title: "with shots" });
      if (!created.ok) throw new Error("setup");
      const first = await addImage(client, user.userId, created.post.id, await png(3000, 1000));
      const second = await addImage(client, user.userId, created.post.id, await png());
      if (!first.ok || !second.ok) throw new Error(JSON.stringify([first, second]));
      expect(first.image).toMatchObject({ mime_type: "image/webp", width: 1600, height: 533, position: 0 });
      expect(second.image.position).toBe(1);
      expect(first.image.storage_path.startsWith(`${user.userId}/`)).toBe(true);

      const thumbUrl = await getImageSignedUrl(client, user.userId, first.image.id, "thumb");
      expect(thumbUrl).toMatch(/^https?:\/\//);
      const bytes = Buffer.from(await (await fetch(thumbUrl!)).arrayBuffer());
      expect((await sharp(bytes).metadata()).width).toBe(480);

      const post = await getPost(client, user.userId, created.post.id);
      expect(post?.images.map((i) => i.id)).toEqual([first.image.id, second.image.id]);
    });

    it("rejects non-images, unknown posts, and other users' posts", async () => {
      const created = await createPost(client, user.userId, { title: "guarded" });
      if (!created.ok) throw new Error("setup");
      expect(await addImage(client, user.userId, created.post.id, Buffer.from("nope"))).toMatchObject({ ok: false, reason: "invalid_image" });
      expect(await addImage(client, user.userId, crypto.randomUUID(), await png())).toEqual({ ok: false, reason: "not_found" });
      expect(await addImage(typed(other), other.userId, created.post.id, await png())).toEqual({ ok: false, reason: "not_found" });
    });

    it("stops at 10 images per post", async () => {
      const created = await createPost(client, user.userId, { title: "full" });
      if (!created.ok) throw new Error("setup");
      const bytes = await png(20, 20);
      for (let n = 0; n < 10; n++) expect((await addImage(client, user.userId, created.post.id, bytes)).ok).toBe(true);
      expect(await addImage(client, user.userId, created.post.id, bytes)).toEqual({ ok: false, reason: "limit_reached" });
    });

    it("soft-deleted images (and images of deleted posts) stop resolving, but bytes remain", async () => {
      const created = await createPost(client, user.userId, { title: "to delete" });
      if (!created.ok) throw new Error("setup");
      const added = await addImage(client, user.userId, created.post.id, await png());
      if (!added.ok) throw new Error("setup");

      expect(await deleteImage(typed(other), other.userId, added.image.id)).toBe(false);
      expect(await deleteImage(client, user.userId, added.image.id)).toBe(true);
      expect(await getImageSignedUrl(client, user.userId, added.image.id, "full")).toBeNull();
      const { data } = await admin.storage.from(LIBRARY_POST_IMAGE_BUCKET).download(added.image.storage_path);
      expect(data).not.toBeNull(); // repo convention: bytes are retained

      const second = await addImage(client, user.userId, created.post.id, await png());
      if (!second.ok) throw new Error("setup");
      await softDeletePost(client, user.userId, created.post.id);
      expect(await getImageSignedUrl(client, user.userId, second.image.id, "thumb")).toBeNull();
    });

    it("never signs another user's image", async () => {
      const created = await createPost(client, user.userId, { title: "private" });
      if (!created.ok) throw new Error("setup");
      const added = await addImage(client, user.userId, created.post.id, await png());
      if (!added.ok) throw new Error("setup");
      expect(await getImageSignedUrl(typed(other), other.userId, added.image.id, "full")).toBeNull();
    });

    it("storage RLS: users cannot read or write another user's folder", async () => {
      const created = await createPost(client, user.userId, { title: "bucket rls" });
      if (!created.ok) throw new Error("setup");
      const added = await addImage(client, user.userId, created.post.id, await png());
      if (!added.ok) throw new Error("setup");

      const read = await other.client.storage.from(LIBRARY_POST_IMAGE_BUCKET).download(added.image.storage_path);
      expect(read.data).toBeNull();
      const write = await other.client.storage
        .from(LIBRARY_POST_IMAGE_BUCKET)
        .upload(`${user.userId}/intruder.webp`, await png(), { contentType: "image/png" });
      expect(write.error).not.toBeNull();
    });
  });
});
