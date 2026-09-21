import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { PostsBrowser } from "@/components/library/PostsBrowser";
import type { LibraryPostWithRelations } from "@/lib/api/entity-types";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/library",
  useSearchParams: () => new URLSearchParams(search),
}));

const useLibraryPosts = vi.fn();
vi.mock("@/hooks/useLibraryPosts", () => ({
  useLibraryPosts: (filters: unknown) => useLibraryPosts(filters),
  useLibraryTags: () => ({ data: [{ tag: "react", n: 2 }] }),
}));
vi.mock("@/components/library/CreatePostDialog", () => ({
  CreatePostDialog: ({ open }: { open: boolean }) => (open ? <div>create dialog</div> : null),
}));

function post(id: string, title: string): LibraryPostWithRelations {
  return {
    id,
    user_id: "u",
    title,
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
    images: [],
    people: [],
    courses: [],
    employers: [],
  };
}

function result(rows: LibraryPostWithRelations[], total = rows.length, page = 1) {
  return { data: { rows, meta: { total, page, limit: 12 } }, isLoading: false, isError: false, isPlaceholderData: false };
}

describe("PostsBrowser", () => {
  beforeEach(() => {
    search = "";
    replace.mockClear();
    useLibraryPosts.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the first-run empty state with a create action", () => {
    useLibraryPosts.mockReturnValue(result([]));
    renderWithProviders(<PostsBrowser />);
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save your first post" }));
    expect(screen.getByText("create dialog")).toBeInTheDocument();
  });

  it("shows a distinct filtered-empty state and can clear filters", () => {
    search = "q=zzz&platform=instagram";
    useLibraryPosts.mockReturnValue(result([]));
    renderWithProviders(<PostsBrowser />);
    expect(screen.getByText("No posts match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(replace).toHaveBeenCalledWith("/library", { scroll: false });
  });

  it("reads filters from the URL and passes them (with the page size) to the hook", () => {
    search = "q=hooks&platform=facebook&favorite=true&tag=react&page=2";
    useLibraryPosts.mockReturnValue(result([post("1", "One")], 30, 2));
    renderWithProviders(<PostsBrowser />);
    expect(useLibraryPosts).toHaveBeenCalledWith({ q: "hooks", platform: "facebook", favorite: true, tags: ["react"], page: 2, limit: 12 });
    expect(screen.getByLabelText("Search saved posts")).toHaveValue("hooks");
  });

  it("debounces typing into a single URL update", () => {
    vi.useFakeTimers();
    useLibraryPosts.mockReturnValue(result([post("1", "One")]));
    renderWithProviders(<PostsBrowser />);
    const box = screen.getByLabelText("Search saved posts");

    fireEvent.change(box, { target: { value: "re" } });
    fireEvent.change(box, { target: { value: "react" } });
    act(() => void vi.advanceTimersByTime(249));
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/library?q=react", { scroll: false });
  });

  it("filter chips update the URL and reset to page 1", () => {
    search = "page=3";
    useLibraryPosts.mockReturnValue(result([post("1", "One")], 40, 3));
    renderWithProviders(<PostsBrowser />);
    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
    expect(replace).toHaveBeenCalledWith("/library?platform=instagram", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: /react/ }));
    // The mocked URL never catches up, so the second change must build on the first (pending) one, not the stale URL.
    expect(replace).toHaveBeenLastCalledWith("/library?platform=instagram&tag=react", { scroll: false });
  });

  it("paginates via the URL", () => {
    useLibraryPosts.mockReturnValue(result([post("1", "One")], 30, 1));
    renderWithProviders(<PostsBrowser />);
    expect(screen.getByText("Showing 1–12 of 30 posts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(replace).toHaveBeenCalledWith("/library?page=2", { scroll: false });
  });

  it("renders a card per post linking to its page", () => {
    useLibraryPosts.mockReturnValue(result([post("abc", "My saved reel")]));
    renderWithProviders(<PostsBrowser />);
    expect(screen.getByRole("link", { name: "My saved reel" })).toHaveAttribute("href", "/library/posts/abc");
  });
});
