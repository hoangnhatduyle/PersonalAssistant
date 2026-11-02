import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { TaskForm } from "@/components/board/TaskForm";
import { makeTask } from "@/lib/dashboard/__tests__/fixtures";

vi.mock("@/hooks/useTodoLists", () => ({
  useTodoLists: () => ({
    data: { rows: [{ id: "list-1", name: "Reading list" }] },
  }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({
    data: { rows: [{ id: "label-1", name: "urgent", color: "red" }] },
  }),
  useCreateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLabel: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
      label_ids: [],
      list_id: null,
    });
  });

  it("adds and removes a label chip", () => {
    renderWithProviders(<TaskForm onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Labels" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle label urgent" }));
    // Close the popover so the selected-chip assertion below matches a
    // single "urgent" node, not also the (always-rendered) popover row.
    fireEvent.mouseDown(document.body);

    expect(screen.getByText("urgent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove label urgent" }));
    expect(screen.queryByText("urgent")).not.toBeInTheDocument();
  });

  it("pre-selects the given defaultListId on a fresh create (e.g. from BoardColumn's Add card)", () => {
    renderWithProviders(<TaskForm defaultListId="list-1" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Board List")).toHaveValue("list-1");
  });

  describe("long-term toggle", () => {
    it("hides the due date and reminder fields while on, and shows them again when off", () => {
      renderWithProviders(<TaskForm onSubmit={vi.fn()} />);
      expect(screen.getByLabelText("Due")).toBeInTheDocument();
      expect(screen.getByLabelText("Reminders enabled")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("switch", { name: /long-term task/i }));
      expect(screen.queryByLabelText("Due")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Reminders enabled")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("switch", { name: /long-term task/i }));
      expect(screen.getByLabelText("Due")).toBeInTheDocument();
    });

    it("submits is_long_term: true with a null due_at, even when a due date was prefilled", async () => {
      const onSubmit = vi.fn();
      renderWithProviders(<TaskForm defaultDueAt="2026-11-10T12:00:00.000Z" onSubmit={onSubmit} />);

      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Loan Research" } });
      fireEvent.click(screen.getByRole("switch", { name: /long-term task/i }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: "Loan Research", is_long_term: true, due_at: null });
    });

    it("starts on for an existing long-term task", () => {
      const task = { ...makeTask({ title: "Loan Research", due_at: null, is_long_term: true }), task_labels: [] };
      renderWithProviders(<TaskForm task={task} onSubmit={vi.fn()} />);
      expect(screen.getByRole("switch", { name: /long-term task/i })).toHaveAttribute("aria-checked", "true");
      expect(screen.queryByLabelText("Due")).not.toBeInTheDocument();
    });
  });
});
