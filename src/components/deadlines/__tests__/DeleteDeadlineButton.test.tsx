import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeleteDeadlineButton } from "@/components/deadlines/DeleteDeadlineButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mutateAsync = vi.fn();
vi.mock("@/hooks/useDeadlines", () => ({ useDeleteDeadline: () => ({ mutateAsync, isPending: false }) }));

async function confirmDelete() {
  fireEvent.click(screen.getByRole("button", { name: "Delete deadline" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
}

describe("DeleteDeadlineButton", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    push.mockReset();
    mutateAsync.mockResolvedValue({ id: "d-1", cascade: { sessionsAffected: 2 } });
  });

  it("goes back to the deadlines list after deleting from the deadline's own page", async () => {
    renderWithProviders(<DeleteDeadlineButton deadlineId="d-1" />);
    await confirmDelete();

    expect(await screen.findByText("Deadline deleted — 2 session(s) removed.")).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/courses/deadlines");
  });

  it("calls onDeleted instead of navigating when it sits in a dialog on another page", async () => {
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteDeadlineButton deadlineId="d-1" onDeleted={onDeleted} />);
    await confirmDelete();

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("does not close or navigate when the delete fails", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteDeadlineButton deadlineId="d-1" onDeleted={onDeleted} />);
    await confirmDelete();

    expect(await screen.findByText("Could not delete deadline")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
