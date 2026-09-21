import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PostImageUploader } from "@/components/library/PostImageUploader";
import type { UploadItem } from "@/hooks/useLibraryPostImages";

function item(id: string, status: UploadItem["status"], error?: string): UploadItem {
  return { id, file: new File(["x"], `${id}.png`, { type: "image/png" }), previewUrl: `blob:${id}`, status, postId: "p", error };
}

const base = { onAdd: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn(), remainingSlots: 5 };

describe("PostImageUploader", () => {
  it("shows per-file status and lets a failed upload be retried", () => {
    const onRetry = vi.fn();
    render(
      <PostImageUploader
        {...base}
        onRetry={onRetry}
        items={[item("a", "done"), item("b", "uploading"), item("c", "queued"), item("d", "error", "Image is too large (max 4 MB)")]}
      />,
    );
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Image is too large (max 4 MB)");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("d");
  });

  it("only offers removal for staged and failed files", () => {
    const onRemove = vi.fn();
    render(<PostImageUploader {...base} onRemove={onRemove} items={[item("s", "staged"), item("u", "uploading")]} />);
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove s.png" }));
    expect(onRemove).toHaveBeenCalledWith("s");
  });

  it("passes only image files to onAdd", () => {
    const onAdd = vi.fn();
    render(<PostImageUploader {...base} onAdd={onAdd} items={[]} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    const png = new File(["x"], "a.png", { type: "image/png" });
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [png, pdf] } });
    expect(onAdd).toHaveBeenCalledWith([png]);
  });

  it("disables the picker when there are no slots left", () => {
    render(<PostImageUploader {...base} remainingSlots={0} items={[]} />);
    expect(screen.getByText("This post has reached 10 screenshots")).toBeInTheDocument();
    expect(document.querySelector("input[type=file]")).toBeDisabled();
  });

  it("queueOnly hides the picker", () => {
    render(<PostImageUploader {...base} queueOnly items={[item("a", "queued")]} />);
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});
