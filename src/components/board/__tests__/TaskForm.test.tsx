import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { TaskForm } from "@/components/board/TaskForm";

vi.mock("@/hooks/useTodoLists", () => ({
  useTodoLists: () => ({
    data: { rows: [{ id: "list-1", name: "Reading list" }] },
  }),
}));

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

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Write report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Write report",
      tags: [],
      list_id: null,
    });
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

  it("pre-selects the given defaultListId on a fresh create (e.g. from BoardColumn's Add card)", () => {
    renderWithProviders(<TaskForm defaultListId="list-1" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Board List")).toHaveValue("list-1");
  });
});
