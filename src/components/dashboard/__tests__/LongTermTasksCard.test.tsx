import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { makeTask } from "@/lib/dashboard/__tests__/fixtures";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  apiFetch,
}));

import { LongTermTasksCard } from "@/components/dashboard/LongTermTasksCard";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const LOAN = makeTask({ id: "loan", title: "Loan Research", is_long_term: true, due_at: null, updated_at: daysAgo(44) });
const DL = makeTask({ id: "dl", title: "Deep Learning Specialization", is_long_term: true, due_at: null, updated_at: daysAgo(9) });

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ data: {} });
});

describe("LongTermTasksCard", () => {
  it("lists long-term tasks longest-untouched first with a touched label and no due/overdue wording", () => {
    renderWithProviders(<LongTermTasksCard tasks={[DL, LOAN, makeTask({ id: "regular", title: "Regular task" })]} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Loan Research")).toBeInTheDocument();
    expect(within(rows[0]).getByText("touched 44d ago")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Deep Learning Specialization")).toBeInTheDocument();
    expect(screen.getByText("2 on radar")).toBeInTheDocument();
    expect(screen.queryByText(/past due|overdue/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Regular task")).not.toBeInTheDocument();
  });

  it("links each title to its board card", () => {
    renderWithProviders(<LongTermTasksCard tasks={[LOAN]} />);
    expect(screen.getByRole("link", { name: "Loan Research" })).toHaveAttribute("href", "/board/loan");
  });

  it("shows a hint instead of an empty list when nothing is long-term", () => {
    renderWithProviders(<LongTermTasksCard tasks={[makeTask()]} />);
    expect(screen.getByText(/nothing on your radar/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("has no 'Still on it' button: a long-term task is meant to stay on the card, so there is nothing to acknowledge", () => {
    renderWithProviders(<LongTermTasksCard tasks={[LOAN]} />);
    expect(screen.queryByRole("button", { name: "Still on it" })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("marking done needs a second click, then posts the done transition", async () => {
    renderWithProviders(<LongTermTasksCard tasks={[LOAN]} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Loan Research done" }));
    expect(apiFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm: mark Loan Research done" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/tasks/loan/transition", { method: "POST", body: { event: "user_marks_done" } }),
    );
  });
});
