import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeadlineTransitionMenu } from "@/components/deadlines/DeadlineTransitionMenu";

vi.mock("@/hooks/useDeadlines", () => ({
  useTransitionDeadline: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
});
