import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarEventEdit } from "@/hooks/useCalendarEventEdit";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";

const mutate = vi.fn();
vi.mock("@/hooks/useCalendarEdits", () => ({
  useApplyCalendarEdit: () => ({ mutate }),
}));

const mutateOccurrence = vi.fn();
vi.mock("@/hooks/useOccurrenceEdits", () => ({
  useApplyOccurrenceEdit: () => ({ mutate: mutateOccurrence }),
}));
const showToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ showToast }) }));

const NOW = new Date("2026-11-06T12:00:00Z");

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "appointment-a-1",
    kind: "appointment",
    entityId: "a-1",
    occurrenceDate: "2026-11-09",
    blockIndex: null,
    occurrence: null,
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
  mutateOccurrence.mockReset();
  showToast.mockReset();
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

describe("useCalendarEventEdit: recurring occurrences", () => {
  // First Solar: Thursday (day 4) 8:30–4:30, the Thursday of 2026-11-12.
  const BLOCKS = [{ days: [1, 2, 4, 5], startMinutes: 510, endMinutes: 990 }];
  const thursday = event({
    id: "course-c-1-0-4",
    kind: "course",
    entityId: "c-1",
    occurrenceDate: "2026-11-12",
    blockIndex: 0,
    occurrence: { originalDate: "2026-11-12", originalStartMinutes: 510, isOverridden: false },
    startMinutes: 510,
    endMinutes: 990,
  });
  const halfDay = { date: "2026-11-12", startMinutes: 780, endMinutes: 990 };
  const setup = () => renderHook(() => useCalendarEventEdit("America/Detroit", () => BLOCKS));

  it("asks before writing anything", () => {
    const { result } = setup();
    act(() => result.current.commit(thursday, halfDay));
    expect(result.current.scope?.event).toBe(thursday);
    expect(mutate).not.toHaveBeenCalled();
    expect(mutateOccurrence).not.toHaveBeenCalled();
  });

  it("'This occurrence' writes one exception, keyed by the series position", () => {
    const { result } = setup();
    act(() => result.current.commit(thursday, halfDay));
    act(() => result.current.chooseThis());
    expect(mutateOccurrence).toHaveBeenCalledWith({
      scope: "this",
      parent: "course",
      id: "c-1",
      originalDate: "2026-11-12",
      originalStartMinutes: 510,
      change: { type: "move", newDate: "2026-11-12", newStartMinutes: 780, newEndMinutes: 990 },
    });
    expect(result.current.scope).toBeNull();
  });

  it("'This occurrence' dropped back on its series position reverts instead of storing a no-op exception", () => {
    const adjusted = event({ ...thursday, occurrenceDate: "2026-11-13", startMinutes: 600, endMinutes: 700, occurrence: { originalDate: "2026-11-12", originalStartMinutes: 510, isOverridden: true } });
    const { result } = setup();
    act(() => result.current.commit(adjusted, { date: "2026-11-12", startMinutes: 510, endMinutes: 990 }));
    act(() => result.current.chooseThis());
    expect(mutateOccurrence).toHaveBeenCalledWith(expect.objectContaining({ change: { type: "revert" } }));
  });

  it("'All occurrences' rewrites the pattern for that weekday only", () => {
    const { result } = setup();
    act(() => result.current.commit(thursday, halfDay));
    act(() => result.current.chooseAll());
    expect(mutateOccurrence).toHaveBeenCalledWith({
      scope: "all",
      parent: "course",
      id: "c-1",
      meetingBlocks: [
        { days: [1, 2, 5], startMinutes: 510, endMinutes: 990 },
        { days: [4], startMinutes: 780, endMinutes: 990 },
      ],
    });
  });

  it("'All occurrences' that cannot be represented tells the user and writes nothing", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit", () => BLOCKS));
    act(() => result.current.commit(thursday, { date: "2026-11-12", startMinutes: 1000, endMinutes: 1500 }));
    act(() => result.current.chooseAll());
    expect(mutateOccurrence).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });

  it("Cancel writes nothing and clears the question", () => {
    const { result } = setup();
    act(() => result.current.commit(thursday, halfDay));
    act(() => result.current.cancelScope());
    expect(result.current.scope).toBeNull();
    expect(mutateOccurrence).not.toHaveBeenCalled();
  });

  it("Skip cancels just that day; Revert only applies to an adjusted one", () => {
    const { result } = setup();
    act(() => result.current.skip(thursday));
    expect(mutateOccurrence).toHaveBeenCalledWith(expect.objectContaining({ change: { type: "cancel" }, originalDate: "2026-11-12" }));
    mutateOccurrence.mockReset();
    act(() => result.current.revert(thursday));
    expect(mutateOccurrence).not.toHaveBeenCalled();
    act(() => result.current.revert(event({ ...thursday, occurrence: { originalDate: "2026-11-12", originalStartMinutes: 510, isOverridden: true } })));
    expect(mutateOccurrence).toHaveBeenCalledWith(expect.objectContaining({ change: { type: "revert" } }));
  });

  it("Skip offers Undo in its toast, which reverts that day's exception", () => {
    const { result } = setup();
    act(() => result.current.skip(thursday));
    const [message, , action] = showToast.mock.calls[0];
    expect(message).toBe("Skipped Dentist");
    mutateOccurrence.mockReset();
    act(() => action.onClick());
    expect(mutateOccurrence).toHaveBeenCalledWith(expect.objectContaining({ change: { type: "revert" }, originalDate: "2026-11-12" }));
  });

  it("'All occurrences' that leaves the pattern as it is writes no pattern change; on an adjusted day it reverts the day", () => {
    const adjusted = event({ ...thursday, startMinutes: 780, occurrence: { originalDate: "2026-11-12", originalStartMinutes: 510, isOverridden: true } });
    const { result } = setup();
    act(() => result.current.commit(thursday, { date: "2026-11-12", startMinutes: 510, endMinutes: 990 }));
    expect(result.current.scope).toBeNull(); // not moved at all
    act(() => result.current.commit(adjusted, { date: "2026-11-12", startMinutes: 510, endMinutes: 990 }));
    act(() => result.current.chooseAll());
    expect(mutateOccurrence).toHaveBeenCalledTimes(1);
    expect(mutateOccurrence).toHaveBeenCalledWith(expect.objectContaining({ scope: "this", change: { type: "revert" } }));
  });
});

describe("useCalendarEventEdit: recurring deadlines", () => {
  const deadline = event({ kind: "deadline", id: "deadline-d-1", entityId: "d-1", recurringDeadline: true, startMinutes: 1020, endMinutes: 1065, occurrenceDate: "2026-11-12" });
  const moved = { date: "2026-11-13", startMinutes: 1200, endMinutes: 1245 };

  it("asks which occurrences before writing anything", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(deadline, moved));
    expect(result.current.scope?.event).toBe(deadline);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("'This occurrence' is the plain due_at edit — no series flag", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(deadline, moved));
    act(() => result.current.chooseThis());
    expect(mutate).toHaveBeenCalledTimes(1);
    const edit = mutate.mock.calls[0][0];
    expect(edit).toMatchObject({ kind: "deadline", id: "d-1" });
    expect(edit.series).toBeUndefined();
    expect(mutateOccurrence).not.toHaveBeenCalled();
  });

  it("'All occurrences' writes the same instant but as a series shift", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(deadline, moved));
    act(() => result.current.chooseAll());
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ kind: "deadline", id: "d-1", series: true });
  });

  it("a series shift into the past still asks first, and keeps the series flag when confirmed", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(deadline, { date: "2026-11-02", startMinutes: 600, endMinutes: 645 }));
    act(() => result.current.chooseAll());
    expect(mutate).not.toHaveBeenCalled();
    expect(result.current.pending).not.toBeNull();
    act(() => result.current.confirmPending());
    expect(mutate.mock.calls[0][0]).toMatchObject({ series: true });
  });

  it("Cancel writes nothing", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit(deadline, moved));
    act(() => result.current.cancelScope());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("a one-off deadline is written straight away, with no question", () => {
    const { result } = renderHook(() => useCalendarEventEdit("America/Detroit"));
    act(() => result.current.commit({ ...deadline, recurringDeadline: false }, moved));
    expect(result.current.scope).toBeNull();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

