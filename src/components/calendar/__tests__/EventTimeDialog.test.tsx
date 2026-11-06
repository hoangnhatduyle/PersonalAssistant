import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventTimeDialog } from "@/components/calendar/EventTimeDialog";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";

vi.mock("@/hooks/useUserTimezone", () => ({
  useUserTimezone: () => "America/Detroit",
  useUserTimezoneReady: () => true,
}));

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "appointment-a-1",
    kind: "appointment",
    entityId: "a-1",
    occurrenceDate: "2026-11-05",
    blockIndex: null,
    editable: true,
    title: "Dentist",
    timeLabel: "10 AM–11 AM",
    subtitle: "Health",
    startMinutes: 600,
    endMinutes: 660,
    tone: "warn",
    href: "/calendar",
    personId: null,
    personLabel: "Me",
    ...overrides,
  };
}

function open(overrides: Partial<CalendarEvent> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const target = event(overrides);
  render(<EventTimeDialog event={target} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose, target };
}

describe("EventTimeDialog", () => {
  it("renders nothing without an event", () => {
    render(<EventTimeDialog event={null} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the event and starts from its current date and times", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Adjust time" })).toBeInTheDocument();
    expect(screen.getByText("Dentist")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("11/5/2026");
    expect(screen.getByLabelText("Start")).toHaveValue("10:00");
    expect(screen.getByLabelText("End")).toHaveValue("11:00");
  });

  it("saves the changed date, start and end", () => {
    const { onSave, target } = open();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "13:30" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(target, { date: "2026-11-09", startMinutes: 810, endMinutes: 900 });
  });

  it("keeps the duration when only the start changes", () => {
    const { onSave, target } = open();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "14:00" } });
    expect(screen.getByLabelText("End")).toHaveValue("15:00");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(target, { date: "2026-11-05", startMinutes: 840, endMinutes: 900 });
  });

  it("refuses an end at or before the start and says so", () => {
    const { onSave } = open();
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("End must be after the start.");
  });

  it("refuses a missing date", () => {
    const { onSave } = open();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a date.");
  });

  it("shows a single Time for a deadline or task — a point in time has no end", () => {
    const { onSave, target } = open({ kind: "deadline", entityId: "d-1", id: "deadline-d-1", startMinutes: 1020, endMinutes: 1065 });
    expect(screen.queryByLabelText("End")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Time")).toHaveValue("17:00");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The marker's drawn 45 minutes travel with the start.
    expect(onSave).toHaveBeenCalledWith(target, { date: "2026-11-05", startMinutes: 1200, endMinutes: 1245 });
  });

  it("Cancel closes without saving", () => {
    const { onSave, onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
