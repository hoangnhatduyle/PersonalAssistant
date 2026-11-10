import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { SessionEditDialog } from "@/components/deadlines/SessionEditDialog";
import { makeAppointment } from "@/lib/dashboard/__tests__/fixtures";

const session = makeAppointment({ id: "s-1", title: "Draft outline", date: "2026-11-12", time: "10:00", duration_minutes: 90, deadline_id: "d-9" });
const query = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false } }));
const mutate = vi.fn();

vi.mock("@/hooks/useAppointments", () => ({
  useAppointment: () => query.value,
  useUpdateAppointment: () => ({ mutate }),
}));
// SessionsSection drags in many hooks; the dialog only borrows its status buttons.
vi.mock("@/components/deadlines/SessionsSection", () => ({
  SessionTransitionButtons: () => <button>Mark Done</button>,
}));

beforeEach(() => {
  mutate.mockReset();
  query.value = { data: session, isLoading: false };
});

describe("SessionEditDialog", () => {
  it("renders nothing while no session is selected", () => {
    renderWithProviders(<SessionEditDialog sessionId={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the session's form, its status actions and a link to its deadline", () => {
    renderWithProviders(<SessionEditDialog sessionId="s-1" onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Draft outline" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Draft outline");
    expect(screen.getByLabelText("Estimate (minutes)")).toHaveValue(90);
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open its deadline" })).toHaveAttribute("href", "/courses/deadlines/d-9");
  });

  it("saves the edits including hand-set progress, then closes with a confirmation", async () => {
    mutate.mockImplementation((_values, options) => options.onSuccess());
    const onClose = vi.fn();
    renderWithProviders(<SessionEditDialog sessionId="s-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    fireEvent.change(screen.getByLabelText(/progress note/i), { target: { value: "half way" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ title: "Draft outline", progress_percent: 50, progress_note: "half way" }), expect.any(Object));
    expect(await screen.findByText("Session updated")).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays open and says so when the save fails", async () => {
    mutate.mockImplementation((_values, options) => options.onError());
    const onClose = vi.fn();
    renderWithProviders(<SessionEditDialog sessionId="s-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not update session")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says when the session cannot be found", () => {
    query.value = { data: undefined, isLoading: false };
    renderWithProviders(<SessionEditDialog sessionId="gone" onClose={vi.fn()} />);
    expect(screen.getByText("Session not found.")).toBeInTheDocument();
  });

  it("cancel closes without saving", () => {
    const onClose = vi.fn();
    renderWithProviders(<SessionEditDialog sessionId="s-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
  });
});
