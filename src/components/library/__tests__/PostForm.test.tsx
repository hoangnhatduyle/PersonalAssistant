import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { PostForm } from "@/components/library/PostForm";
import { ApiError } from "@/lib/http/client";

vi.mock("@/hooks/usePeople", () => ({
  usePeople: () => ({ data: { rows: [{ id: "11111111-1111-4111-8111-111111111111", name: "Chau" }] }, isLoading: false }),
}));
vi.mock("@/hooks/useCourses", () => ({
  useCourses: () => ({ data: { rows: [{ id: "22222222-2222-4222-8222-222222222222", name: "Algorithms", code: "CS101" }] }, isLoading: false }),
}));

vi.mock("@/hooks/useLibraryEmployers", () => ({
  useLibraryEmployers: () => ({ data: { rows: [{ id: "33333333-3333-4333-8333-333333333333", name: "Acme Corp" }] }, isLoading: false }),
}));

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("PostForm", () => {
  const onSubmit = vi.fn();
  beforeEach(() => onSubmit.mockReset().mockResolvedValue(undefined));

  it("requires a title", async () => {
    renderWithProviders(<PostForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    expect(await screen.findByText("Give the post a title")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("detects the platform from the URL", () => {
    renderWithProviders(<PostForm onSubmit={onSubmit} />);
    fill("Link (optional)", "https://www.instagram.com/p/ABC/");
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    fill("Link (optional)", "https://m.facebook.com/story.php?story_fbid=1");
    expect(screen.getByText("Facebook")).toBeInTheDocument();
  });

  it("rejects a javascript: URL and never submits", async () => {
    renderWithProviders(<PostForm onSubmit={onSubmit} />);
    fill("Title", "Sneaky");
    fill("Link (optional)", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    expect(await screen.findByText("Enter a valid http(s) link")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the parsed payload with tags and linked people/courses", async () => {
    renderWithProviders(<PostForm onSubmit={onSubmit} />);
    fill("Title", "  Great reel ");
    fill("Link (optional)", "https://www.instagram.com/reel/XyZ/");
    fill("Notes", "worth a rewatch");

    const tagBox = screen.getByPlaceholderText("Add a tag…");
    fireEvent.change(tagBox, { target: { value: "React" } });
    fireEvent.keyDown(tagBox, { key: "Enter" });
    fireEvent.click(screen.getByLabelText("Chau"));
    fireEvent.click(screen.getByLabelText("CS101 · Algorithms"));
    fireEvent.click(screen.getByLabelText("Acme Corp"));
    fireEvent.click(screen.getByRole("switch", { name: "Favorite" }));

    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Great reel",
      url: "https://www.instagram.com/reel/XyZ/",
      notes: "worth a rewatch",
      tags: ["react"],
      is_favorite: true,
      person_ids: ["11111111-1111-4111-8111-111111111111"],
      course_ids: ["22222222-2222-4222-8222-222222222222"],
      employer_ids: ["33333333-3333-4333-8333-333333333333"],
    });
  });

  it("turns a blank link into null", async () => {
    renderWithProviders(<PostForm onSubmit={onSubmit} />);
    fill("Title", "Screenshot only");
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].url).toBeNull();
  });

  it("shows 'Already saved — Open it' on a 409", async () => {
    // A plain async function, not vi.fn().mockRejectedValue: vitest's spy tracking leaves the rejected promise flagged as unhandled.
    const duplicate = async () => {
      throw new ApiError("This link is already saved", 409, { existing_id: "abc" });
    };
    renderWithProviders(<PostForm onSubmit={duplicate} />);
    fill("Title", "Dup");
    fill("Link (optional)", "https://example.com/x");
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    expect(await screen.findByText(/Already saved/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/library/posts/abc");
  });

  it("surfaces other failures inline", async () => {
    const failing = async () => {
      throw new ApiError("Internal server error", 500);
    };
    renderWithProviders(<PostForm onSubmit={failing} />);
    fill("Title", "Boom");
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
