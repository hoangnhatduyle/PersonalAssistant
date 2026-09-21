import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";

const mutateAsync = vi.fn();
vi.mock("@/hooks/useDeadlines", () => ({
  useTransitionDeadline: () => ({ mutateAsync, isPending: false }),
}));

describe("DeadlineTransitionMenu", () => {
  it("Not Started offers Mark In Progress and Cancel", () => {
    renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" />);
    expect(screen.getByRole("button", { name: "Mark In Progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("In Progress offers Mark Submitted and Cancel", () => {
    renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="In Progress" />);
    expect(screen.getByRole("button", { name: "Mark Submitted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("Overdue offers Mark Submitted only — never Cancel", () => {
    renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Overdue" />);
    expect(screen.getByRole("button", { name: "Mark Submitted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Submitted offers Confirm Done only", () => {
    renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Submitted" />);
    expect(screen.getByRole("button", { name: "Confirm Done" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Completed and Cancelled offer nothing", () => {
    const completed = renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Completed" />);
    expect(completed.container).toBeEmptyDOMElement();

    const cancelled = renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Cancelled" />);
    expect(cancelled.container).toBeEmptyDOMElement();
  });

  describe("cancelling a recurring deadline", () => {
    beforeEach(() => mutateAsync.mockReset().mockResolvedValue(undefined));

    it("a one-off deadline cancels straight away with no dialog", async () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ event: "user_cancels" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("asks whether to cancel just this occurrence or the whole series, and cancels nothing until you choose", () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" isRecurring />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel this occurrence" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel the whole series" })).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("'Cancel this occurrence' sends scope occurrence", async () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="In Progress" isRecurring />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel this occurrence" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ event: "user_cancels", scope: "occurrence" }));
    });

    it("'Cancel the whole series' sends scope series", async () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" isRecurring />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel the whole series" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ event: "user_cancels", scope: "series" }));
    });

    it("'Keep deadline' closes the dialog without cancelling", () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" isRecurring />);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep deadline" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("other transitions on a recurring deadline don't ask anything", async () => {
      renderWithProviders(<DeadlineTransitionMenu deadlineId="d-1" status="Not Started" isRecurring />);
      fireEvent.click(screen.getByRole("button", { name: "Mark In Progress" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ event: "user_marks_in_progress" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
