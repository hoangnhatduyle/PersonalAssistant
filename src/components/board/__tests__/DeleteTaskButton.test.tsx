import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeleteTaskButton } from "@/components/board/DeleteTaskButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mutateAsync = vi.fn();
vi.mock("@/hooks/useTasks", () => ({
  useDeleteTask: () => ({ mutateAsync, isPending: false }),
}));

describe("DeleteTaskButton", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    push.mockReset();
  });

  it("renders the confirm copy warning about unlinking, and the DELETE response's notesUnlinked count in the toast", async () => {
    mutateAsync.mockResolvedValue({
      id: "task-1",
      cascade: { notesUnlinked: 2 },
    });
    renderWithProviders(<DeleteTaskButton taskId="task-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(
      screen.getByText("Any notes linked to it will be unlinked."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Card deleted — 2 note(s) unlinked."),
    ).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/board");
  });

  it("redirects to the passed fallbackHref instead of /board when one is given", async () => {
    mutateAsync.mockResolvedValue({
      id: "task-1",
      cascade: { notesUnlinked: 0 },
    });
    renderWithProviders(
      <DeleteTaskButton taskId="task-1" fallbackHref="/courses/course-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/courses/course-1");
  });
});
