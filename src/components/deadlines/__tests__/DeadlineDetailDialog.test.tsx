import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeadlineDetailDialog } from "@/components/deadlines/DeadlineDetailDialog";

vi.mock("@/hooks/useDeadlines", () => ({
  useDeadline: (id: string) => ({ data: id === "d-1" ? { id: "d-1", title: "Term paper" } : undefined }),
}));
// The container has its own behaviour; the dialog's job is to host it embedded and close on delete.
vi.mock("@/components/deadlines/DeadlineDetailContainer", () => ({
  DeadlineDetailContainer: ({ deadlineId, embedded, onDeleted }: { deadlineId: string; embedded?: boolean; onDeleted?: () => void }) => (
    <div>
      <span>{`container for ${deadlineId}, embedded: ${String(embedded)}`}</span>
      <button onClick={onDeleted}>simulate delete</button>
    </div>
  ),
}));

describe("DeadlineDetailDialog", () => {
  it("renders nothing while no deadline is selected", () => {
    renderWithProviders(<DeadlineDetailDialog deadlineId={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a dialog titled with the deadline and hosts its detail in embedded form", () => {
    renderWithProviders(<DeadlineDetailDialog deadlineId="d-1" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Term paper" })).toBeInTheDocument();
    expect(screen.getByText("container for d-1, embedded: true")).toBeInTheDocument();
  });

  it("uses a generic title until the deadline has loaded", () => {
    renderWithProviders(<DeadlineDetailDialog deadlineId="d-unknown" onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Deadline" })).toBeInTheDocument();
  });

  it("closes when the deadline is deleted from inside it", () => {
    const onClose = vi.fn();
    renderWithProviders(<DeadlineDetailDialog deadlineId="d-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "simulate delete" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderWithProviders(<DeadlineDetailDialog deadlineId="d-1" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
