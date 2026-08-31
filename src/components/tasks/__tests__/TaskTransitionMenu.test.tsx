import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { TaskTransitionMenu } from "@/components/tasks/TaskTransitionMenu";

vi.mock("@/hooks/useTasks", () => ({
  useTransitionTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("TaskTransitionMenu", () => {
  it("renders both actions for Open", () => {
    renderWithProviders(<TaskTransitionMenu taskId="task-1" status="Open" />);
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders nothing for Done (terminal, no reopen)", () => {
    const { container } = renderWithProviders(<TaskTransitionMenu taskId="task-1" status="Done" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for Cancelled (terminal, no reopen)", () => {
    const { container } = renderWithProviders(<TaskTransitionMenu taskId="task-1" status="Cancelled" />);
    expect(container).toBeEmptyDOMElement();
  });
});
