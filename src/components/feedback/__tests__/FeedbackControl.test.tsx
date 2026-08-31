import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { FeedbackControl } from "@/components/feedback/FeedbackControl";

const useFeedback = vi.fn();
const createMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();

vi.mock("@/hooks/useFeedback", () => ({
  useFeedback: () => useFeedback(),
  useCreateFeedback: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useDeleteFeedback: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

beforeEach(() => {
  useFeedback.mockReset();
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
});

describe("FeedbackControl", () => {
  it("shows the interactive rating form when no feedback exists yet for this target", () => {
    useFeedback.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<FeedbackControl targetType="task" targetId="task-1" />);

    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete feedback" })).not.toBeInTheDocument();
  });

  it("submits the selected rating for this exact target", async () => {
    useFeedback.mockReturnValue({ data: [], isLoading: false });
    createMutateAsync.mockResolvedValue({ id: "fb-1" });
    renderWithProviders(<FeedbackControl targetType="task" targetId="task-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      target_type: "task",
      target_id: "task-1",
      rating: 4,
    });
  });

  it("swaps to read-only stars + a delete affordance once a rating exists for this target", () => {
    useFeedback.mockReturnValue({
      data: [{ id: "fb-1", target_type: "task", target_id: "task-1", rating: 5, comment: "Great" }],
      isLoading: false,
    });
    renderWithProviders(<FeedbackControl targetType="task" targetId="task-1" />);

    expect(screen.queryByRole("radiogroup", { name: "Rating" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rated 5 out of 5")).toBeInTheDocument();
    expect(screen.getByText('"Great"')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete feedback" })).toBeInTheDocument();
  });

  it("ignores feedback rows belonging to a different target", () => {
    useFeedback.mockReturnValue({
      data: [{ id: "fb-1", target_type: "task", target_id: "some-other-task", rating: 3, comment: null }],
      isLoading: false,
    });
    renderWithProviders(<FeedbackControl targetType="task" targetId="task-1" />);

    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeInTheDocument();
  });

  it("deletes the existing feedback row", async () => {
    useFeedback.mockReturnValue({
      data: [{ id: "fb-1", target_type: "task", target_id: "task-1", rating: 5, comment: null }],
      isLoading: false,
    });
    deleteMutateAsync.mockResolvedValue({ id: "fb-1" });
    renderWithProviders(<FeedbackControl targetType="task" targetId="task-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete feedback" }));

    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledTimes(1));
  });
});
