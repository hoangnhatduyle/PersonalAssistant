import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeleteCourseButton } from "@/components/courses/DeleteCourseButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mutateAsync = vi.fn();
vi.mock("@/hooks/useCourses", () => ({
  useDeleteCourse: () => ({ mutateAsync, isPending: false }),
}));

describe("DeleteCourseButton", () => {
  it("renders the generic pre-delete warning (deadlines are deleted too)", () => {
    renderWithProviders(<DeleteCourseButton courseId="course-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete course" }));
    expect(
      screen.getByText(
        "Deleting this course also deletes its deadlines, dismisses their reminders, unlinks its notes, and deletes its to-do list.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the DELETE response's exact cascade counts in the post-delete summary", async () => {
    mutateAsync.mockResolvedValue({
      id: "course-1",
      cascade: { deadlinesDeleted: 3, remindersDismissed: 2, notesUnlinked: 5, todoItemsDeleted: 4 },
    });
    renderWithProviders(<DeleteCourseButton courseId="course-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete course" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Course deleted — 3 deadline(s) deleted, 2 reminder(s) dismissed, 5 note(s) unlinked, 4 to-do item(s) deleted.",
      ),
    ).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/courses");
  });
});
