import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarEventEdit } from "@/hooks/useCalendarEventEdit";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";

const mutate = vi.fn();
vi.mock("@/hooks/useCalendarEdits", () => ({
  useApplyCalendarEdit: () => ({ mutate }),
}));

const NOW = new Date("2026-11-06T12:00:00Z");

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "appointment-a-1",
    kind: "appointment",
    entityId: "a-1",
    occurrenceDate: "2026-11-09",
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

beforeEach(() => {
  mutate.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("useCalendarEventEdit", () => {
  it("writes a changed appointment straight away", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(event(), { date: "2026-11-10", startMinutes: 720, endMinutes: 810 }));
    expect(mutate).toHaveBeenCalledWith({
      kind: "appointment",
      id: "a-1",
      body: { date: "2026-11-10", time: "12:00", duration_minutes: 90 },
      dueAt: null,
    });
    expect(result.current.pending).toBeNull();
  });

  it("does nothing when the block did not actually move", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(event(), { date: "2026-11-09", startMinutes: 600, endMinutes: 660 }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does nothing for a read-only block", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(event({ editable: false }), { date: "2026-11-10", startMinutes: 720, endMinutes: 780 }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("writes a deadline moved to the future straight away, as an instant in the profile zone", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    const deadline = event({ kind: "deadline", entityId: "d-1", id: "deadline-d-1", startMinutes: 1020, endMinutes: 1065 });
    act(() => result.current.commit(deadline, { date: "2026-11-10", startMinutes: 1020, endMinutes: 1065 }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "deadline", id: "d-1", body: { due_at: "2026-11-10T22:00:00.000Z" } }));
  });

  it("asks first when a deadline would land in the past, and writes only after confirmation", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    const deadline = event({ kind: "deadline", entityId: "d-1", id: "deadline-d-1", title: "Essay", startMinutes: 1020, endMinutes: 1065 });
    act(() => result.current.commit(deadline, { date: "2026-11-02", startMinutes: 1020, endMinutes: 1065 }));

    expect(mutate).not.toHaveBeenCalled();
    expect(result.current.pending).toMatchObject({ title: "Essay", edit: { kind: "deadline", id: "d-1" } });

    act(() => result.current.confirmPending());
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "deadline", id: "d-1" }));
    expect(result.current.pending).toBeNull();
  });

  it("drops a past move that is cancelled", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    const task = event({ kind: "task", entityId: "t-1", id: "task-t-1", startMinutes: 600, endMinutes: 645 });
    act(() => result.current.commit(task, { date: "2026-11-02", startMinutes: 600, endMinutes: 645 }));
    expect(result.current.pending).not.toBeNull();
    act(() => result.current.cancelPending());
    expect(result.current.pending).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("moving an appointment into the past needs no confirmation", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(event(), { date: "2026-11-02", startMinutes: 600, endMinutes: 660 }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  });
});
