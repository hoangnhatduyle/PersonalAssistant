import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostCard } from "@/components/library/PostCard";
import type { LibraryPostImage, LibraryPostWithRelations } from "@/lib/api/entity-types";

function post(overrides: Partial<LibraryPostWithRelations> = {}): LibraryPostWithRelations {
  return {
    id: "p1",
    user_id: "u",
    title: "Weakness Answers",
    url: null,
    normalized_url: null,
    platform: "instagram",
    author_name: null,
    notes: "",
    tags: [],
    is_favorite: false,
    archived_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    images: [],
    people: [],
    courses: [],
    employers: [],
    ...overrides,
  };
}

describe("PostCard cover", () => {
  it("shows the default cover when the post has no screenshots", () => {
    render(<PostCard post={post()} />);
    expect(screen.getByTestId("default-post-cover")).toBeInTheDocument();
  });

  it("shows the first screenshot instead of the default cover when one exists", () => {
    const image = { id: "img1", width: 800, height: 600 } as LibraryPostImage;
    const { container } = render(<PostCard post={post({ images: [image] })} />);
    expect(screen.queryByTestId("default-post-cover")).not.toBeInTheDocument();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/library/post-images/img1/file?size=thumb");
  });
});
