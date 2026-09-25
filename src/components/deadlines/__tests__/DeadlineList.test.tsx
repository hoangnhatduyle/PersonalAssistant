import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeadlineList } from "@/components/deadlines/DeadlineList";
import type { DeadlineRow } from "@/lib/api/entity-types";

vi.mock("@/hooks/useDeadlines", () => ({
  useTransitionDeadline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function makeDeadline(id: string, courseId: string, title: string): DeadlineRow {
  return {
    id,
    course_id: courseId,
    title,
    status: "In Progress",
    priority: "High",
    due_at: "2026-10-04T23:59:00Z",
    recurrence_days: [],
    recurrence_end_date: null,
    recurrence_series_id: null,
    recurrence_spawned_at: null,
    person_id: null,
    completed_at: null,
    acknowledged_at: null,
    deleted_at: null,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
    user_id: "user-1",
  };
}

describe("DeadlineList", () => {
  // Regression for the "No course" ghost duplicate: courseNameById is built
  // from useCourses, which usually resolves after useDeadlines, so the
  // component's first real paint often has two courses that are both
  // unresolved. Grouping keyed by the shared "No course" label (instead of
  // the actual course_id) collided different courses under one React key,
  // and orphaned a stale copy once the names arrived — see DeadlineList.tsx.
  it("keeps deadlines from different unresolved courses in separate groups", () => {
    const deadlines = [makeDeadline("d-1", "course-a", "Homework 1"), makeDeadline("d-2", "course-b", "Homework 2")];
    renderWithProviders(<DeadlineList deadlines={deadlines} courseNameById={undefined} />);

    expect(screen.getAllByText("No course")).toHaveLength(2);
    expect(screen.getAllByText("Homework 1")).toHaveLength(1);
    expect(screen.getAllByText("Homework 2")).toHaveLength(1);
  });

  it("leaves no stale group behind once course names resolve", () => {
    const deadlines = [makeDeadline("d-1", "course-a", "Homework 1"), makeDeadline("d-2", "course-b", "Homework 2")];
    const { rerender } = renderWithProviders(<DeadlineList deadlines={deadlines} courseNameById={undefined} />);

    const courseNameById = new Map([
      ["course-a", "Advanced Algorithms I"],
      ["course-b", "Machine Learning"],
    ]);
    rerender(<DeadlineList deadlines={deadlines} courseNameById={courseNameById} />);

    expect(screen.queryByText("No course")).not.toBeInTheDocument();
    expect(screen.getByText("Advanced Algorithms I")).toBeInTheDocument();
    expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    expect(screen.getAllByText("Homework 1")).toHaveLength(1);
    expect(screen.getAllByText("Homework 2")).toHaveLength(1);
  });
});
