import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { TaskForm } from "@/components/tasks/TaskForm";

describe("TaskForm", () => {
  it("rejects an empty title and never calls onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the zodResolver-parsed payload for a valid title", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Write report" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: "Write report", tags: [] });
  });

  it("adds and removes a tag chip", () => {
    renderWithProviders(<TaskForm onSubmit={vi.fn()} />);

    const tagInput = screen.getByPlaceholderText("Add a tag and press Enter");
    fireEvent.change(tagInput, { target: { value: "urgent" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });

    expect(screen.getByText("urgent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove tag urgent" }));
    expect(screen.queryByText("urgent")).not.toBeInTheDocument();
  });
});
