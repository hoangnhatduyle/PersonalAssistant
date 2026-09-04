import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { SessionTransitionButtons } from "@/components/deadlines/SessionsSection";
import type { AppointmentRow, SessionStatus } from "@/lib/api/entity-types";

vi.mock("@/hooks/useAppointments", () => ({
  useTransitionAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function makeSession(sessionStatus: SessionStatus): AppointmentRow {
  return {
    id: "s-1",
    user_id: "u-1",
    title: "Draft outline",
    date: "2026-09-10",
    category: "Session",
    time: null,
    location: null,
    notes: [],
    reminders_enabled: false,
    reminder_lead_minutes: 60,
    deadline_id: "d-1",
    duration_minutes: null,
    session_status: sessionStatus,
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  };
}

describe("SessionTransitionButtons", () => {
  it("planned offers Mark Done and Mark Skipped", () => {
    renderWithProviders(<SessionTransitionButtons session={makeSession("planned")} />);
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Skipped" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("skipped offers Mark Done only — a make-up session, never re-skipping", () => {
    renderWithProviders(<SessionTransitionButtons session={makeSession("skipped")} />);
    expect(screen.getByRole("button", { name: "Mark Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Skipped" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("done offers nothing — the terminal state", () => {
    const { container } = renderWithProviders(<SessionTransitionButtons session={makeSession("done")} />);
    expect(container).toBeEmptyDOMElement();
  });
});
