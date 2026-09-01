import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeletePersonButton } from "@/components/people/DeletePersonButton";

const mutateAsync = vi.fn();
vi.mock("@/hooks/usePeople", () => ({
  useDeletePerson: () => ({ mutateAsync, isPending: false }),
}));

describe("DeletePersonButton", () => {
  it("renders a pre-delete warning naming the cascading entities", () => {
    renderWithProviders(<DeletePersonButton personId="person-1" personName="Chau" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      screen.getByText("This also deletes their courses, deadlines, and tasks, and dismisses any of their pending reminders."),
    ).toBeInTheDocument();
  });

  it("renders the DELETE response's exact cascade counts in the post-delete toast", async () => {
    mutateAsync.mockResolvedValue({
      id: "person-1",
      cascade: { coursesDeleted: 2, deadlinesDeleted: 4, tasksDeleted: 1, remindersDismissed: 3, notesUnlinked: 2 },
    });
    renderWithProviders(<DeletePersonButton personId="person-1" personName="Chau" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Chau removed — 2 course(s), 4 deadline(s), 1 task(s) deleted, 3 reminder(s) dismissed."),
    ).toBeInTheDocument();
  });
});
