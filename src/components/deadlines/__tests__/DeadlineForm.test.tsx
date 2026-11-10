import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { makeDeadline } from "@/lib/dashboard/__tests__/fixtures";

// zod validates course_id as a uuid, so the fixture must use a real one.
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("@/hooks/useCourses", () => ({
  useCourses: () => ({
    data: { rows: [{ id: "550e8400-e29b-41d4-a716-446655440000", name: "Algorithms", reminders_enabled: false, reminder_lead_minutes: 30 }] },
  }),
}));

describe("DeadlineForm estimate and progress", () => {
  const existing = (overrides = {}) => makeDeadline({ id: "d-1", course_id: COURSE_ID, title: "Term paper", due_at: "2026-11-20T23:59:00Z", ...overrides });

  it("submits the saved estimate and progress unchanged when nothing is touched", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<DeadlineForm deadline={existing({ estimated_hours: 8, progress_percent: 25, progress_note: "outline done" })} onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Estimate (hours)")).toHaveValue(8);
    expect(screen.getByRole("slider", { name: /progress/i })).toHaveAttribute("aria-valuetext", "25%");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: 8, progress_percent: 25, progress_note: "outline done" });
  });

  it("updates the estimate and a hand-set progress", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<DeadlineForm deadline={existing()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "75%" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: 12.5, progress_percent: 75 });
  });

  it("shows the automatic progress derived from sessions and its reason", () => {
    renderWithProviders(<DeadlineForm deadline={existing()} autoProgress={{ percent: 40, hint: "From done sessions out of all planned sessions" }} onSubmit={vi.fn()} />);

    expect(screen.getByText("Auto 40%")).toBeInTheDocument();
    expect(screen.getByText("From done sessions out of all planned sessions")).toBeInTheDocument();
  });

  it("clearing the estimate and going back to automatic sends explicit nulls", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<DeadlineForm deadline={existing({ estimated_hours: 3, progress_percent: 60 })} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /use automatic/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ estimated_hours: null, progress_percent: null });
  });

  it("rejects an estimate of zero", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<DeadlineForm deadline={existing()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Estimate (hours)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
