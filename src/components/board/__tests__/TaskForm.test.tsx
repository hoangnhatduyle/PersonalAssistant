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

describe("TaskForm estimate and progress", () => {
  const savedTask = (overrides = {}) => ({ ...makeTask({ id: "t-9", title: "Read paper" }), task_labels: [], ...overrides });

  it("submits an estimate and a hand-set progress with a note", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Write report" } });
    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    fireEvent.change(screen.getByLabelText(/progress note/i), { target: { value: "outline done" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: 2.5, progress_percent: 50, progress_note: "outline done" });
  });

  it("sends explicit nulls when nothing is set, so a later edit can clear them", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Write report" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: null, progress_percent: null, progress_note: null });
  });

  it("clears a stored estimate and goes back to automatic progress", async () => {
    const onSubmit = vi.fn();
    const task = savedTask({ estimated_hours: 4, progress_percent: 30 });
    renderWithProviders(<TaskForm task={task} onSubmit={onSubmit} autoProgress={{ percent: 60, hint: "From checklist items done" }} />);

    expect(screen.getByLabelText("Estimate (hours)")).toHaveValue(4);
    expect(screen.getByText("30%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /use automatic/i }));
    expect(screen.getByText("Auto 60%")).toBeInTheDocument();
    expect(screen.getByText("From checklist items done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: null, progress_percent: null });
  });

  it("keeps a deliberate 0 percent", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm task={savedTask()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "0%" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].progress_percent).toBe(0);
  });

  it("rejects a non-positive estimate", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Write report" } });
    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
