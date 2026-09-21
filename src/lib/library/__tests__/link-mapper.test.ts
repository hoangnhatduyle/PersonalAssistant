import { describe, expect, it } from "vitest";
import { mapPostRow, type LibraryPostRow } from "@/lib/library/link-mapper";
import type { LibraryPostImage } from "@/lib/api/entity-types";

function post(overrides: Partial<LibraryPostRow> = {}): LibraryPostRow {
  return {
    id: "post-1",
    user_id: "user-1",
    title: "A post",
    url: null,
    normalized_url: null,
    platform: "other",
    author_name: null,
    notes: "",
    tags: [],
    is_favorite: false,
    archived_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function image(id: string, overrides: Partial<LibraryPostImage> = {}): LibraryPostImage {
  return {
    id,
    user_id: "user-1",
    post_id: "post-1",
    storage_path: `u/${id}.webp`,
    thumb_path: `u/${id}.thumb.webp`,
    mime_type: "image/webp",
    width: 100,
    height: 100,
    size_bytes: 10,
    position: 0,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapPostRow", () => {
  it("strips embed keys and defaults missing embeds to empty lists", () => {
    const mapped = mapPostRow(post());
    expect(mapped).toMatchObject({ id: "post-1", images: [], people: [], courses: [], employers: [] });
    expect(mapped).not.toHaveProperty("library_post_people");
    expect(mapped).not.toHaveProperty("library_post_courses");
    expect(mapped).not.toHaveProperty("library_post_employers");
  });

  it("drops soft-deleted images and orders the rest by position then created_at", () => {
    const mapped = mapPostRow(
      post({
        images: [
          image("c", { position: 1 }),
          image("dead", { deleted_at: "2026-02-01T00:00:00Z" }),
          image("b", { position: 0, created_at: "2026-01-02T00:00:00Z" }),
          image("a", { position: 0 }),
        ],
      }),
    );
    expect(mapped.images.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("drops links whose person/course is null or soft-deleted", () => {
    const mapped = mapPostRow(
      post({
        library_post_people: [
          { person: { id: "p1", name: "Ann", deleted_at: null } },
          { person: { id: "p2", name: "Bob", deleted_at: "2026-02-01T00:00:00Z" } },
          { person: null },
        ],
        library_post_courses: [
          { course: { id: "c1", name: "Algo", code: "CS1", deleted_at: null } },
          { course: { id: "c2", name: "Gone", code: null, deleted_at: "2026-02-01T00:00:00Z" } },
          { course: null },
        ],
      }),
    );
    expect(mapped.people).toEqual([{ id: "p1", name: "Ann" }]);
    expect(mapped.courses).toEqual([{ id: "c1", name: "Algo", code: "CS1" }]);
  });
});

describe("mapPostRow — employer links", () => {
  it("flattens live employers and drops null / soft-deleted ones", () => {
    const mapped = mapPostRow(
      post({
        library_post_employers: [
          { employer: { id: "e1", name: "Acme", deleted_at: null } },
          { employer: { id: "e2", name: "Gone Inc", deleted_at: "2026-02-01T00:00:00Z" } },
          { employer: null },
        ],
      }),
    );
    expect(mapped.employers).toEqual([{ id: "e1", name: "Acme" }]);
  });
});
