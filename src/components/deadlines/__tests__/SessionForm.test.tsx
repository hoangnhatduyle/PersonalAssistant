import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { SessionForm } from "@/components/deadlines/SessionForm";
import { makeAppointment } from "@/lib/dashboard/__tests__/fixtures";

describe("SessionForm progress", () => {
  it("has no progress controls when adding a new session", () => {
    renderWithProviders(<SessionForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("slider", { name: /progress/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estimate (minutes)")).toBeInTheDocument();
  });

  it("shows automatic progress from the session's status when editing", () => {
    renderWithProviders(<SessionForm session={makeAppointment({ session_status: "done", title: "Draft", date: "2026-11-10" })} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Auto 100%")).toBeInTheDocument();
  });

  it("submits a hand-set progress and note, then clears them back to automatic", () => {
    const onSubmit = vi.fn();
    renderWithProviders(<SessionForm session={makeAppointment({ title: "Draft", date: "2026-11-10" })} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    fireEvent.change(screen.getByLabelText(/progress note/i), { target: { value: "half the reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ progress_percent: 50, progress_note: "half the reading" }));

    fireEvent.click(screen.getByRole("button", { name: /use automatic/i }));
    fireEvent.change(screen.getByLabelText(/progress note/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ progress_percent: null, progress_note: null }));
  });

  it("omits the progress keys entirely when creating, so a new session never writes them", () => {
    const onSubmit = vi.fn();
    renderWithProviders(<SessionForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Draft outline" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const submitted = onSubmit.mock.calls[0]?.[0] ?? {};
    expect("progress_percent" in submitted).toBe(false);
  });
});
