import type { ReactNode } from "react";
import { act, renderHook, waitFor, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import { appointmentKeys, deadlineKeys, reminderKeys, taskKeys } from "@/lib/query/keys";
import { CALENDAR_APPOINTMENT_FILTERS, CALENDAR_LIST_FILTERS } from "@/lib/calendar/query-filters";
import { ToastProvider } from "@/components/ui/Toast";
import { useApplyCalendarEdit } from "@/hooks/useCalendarEdits";
import type { CalendarEdit } from "@/lib/calendar/edit-patches";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/http/client")>()), apiFetch }));

type Row = { id: string; [field: string]: unknown };
const page = (rows: Row[]) => ({ rows, meta: { total: rows.length, page: 1, limit: 100 } });

const appointmentsKey = appointmentKeys.list(CALENDAR_APPOINTMENT_FILTERS);
const deadlinesKey = deadlineKeys.list(CALENDAR_LIST_FILTERS);
const tasksKey = taskKeys.list(CALENDAR_LIST_FILTERS);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(appointmentsKey, page([{ id: "a-1", date: "2026-11-05", time: "10:00", duration_minutes: 60 }, { id: "a-2", date: "2026-11-05", time: "13:00", duration_minutes: 30 }]));
  client.setQueryData(deadlinesKey, page([{ id: "d-1", due_at: "2026-11-06T17:00:00.000Z" }]));
  client.setQueryData(tasksKey, page([{ id: "t-1", due_at: "2026-11-06T18:00:00.000Z" }]));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useApplyCalendarEdit(), { wrapper });
  return { client, result };
}

const rowsOf = (client: QueryClient, key: readonly unknown[]) => (client.getQueryData(key) as ReturnType<typeof page>).rows;

const appointmentEdit: CalendarEdit = {
  kind: "appointment",
  id: "a-1",
  body: { date: "2026-11-06", time: "15:30", duration_minutes: 90 },
  dueAt: null,
};

describe("useApplyCalendarEdit", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("PATCHes the right endpoint with the edit's body", async () => {
    apiFetch.mockResolvedValue({ data: {} });
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync(appointmentEdit);
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/appointments/a-1", { method: "PATCH", body: appointmentEdit.body });

    await act(async () => {
      await result.current.mutateAsync({ kind: "deadline", id: "d-1", body: { due_at: "2026-11-07T00:00:00.000Z" }, dueAt: "2026-11-07T00:00:00.000Z" });
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/deadlines/d-1", { method: "PATCH", body: { due_at: "2026-11-07T00:00:00.000Z" } });

    await act(async () => {
      await result.current.mutateAsync({ kind: "task", id: "t-1", body: { due_at: "2026-11-07T01:00:00.000Z" }, dueAt: "2026-11-07T01:00:00.000Z" });
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/tasks/t-1", { method: "PATCH", body: { due_at: "2026-11-07T01:00:00.000Z" } });
  });

  it("moves the block in the cache immediately, before the server answers, and only that row", async () => {
    let resolve!: (value: unknown) => void;
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client, result } = setup();

    act(() => {
      result.current.mutate(appointmentEdit);
    });
    await waitFor(() => expect(rowsOf(client, appointmentsKey)[0]).toMatchObject({ id: "a-1", date: "2026-11-06", time: "15:30", duration_minutes: 90 }));
    expect(rowsOf(client, appointmentsKey)[1]).toMatchObject({ id: "a-2", date: "2026-11-05", time: "13:00" });

    await act(async () => {
      resolve({ data: {} });
    });
  });

  it("applies a deadline/task due_at optimistically too", async () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    const { client, result } = setup();
    act(() => {
      result.current.mutate({ kind: "deadline", id: "d-1", body: { due_at: "2026-11-09T05:00:00.000Z" }, dueAt: "2026-11-09T05:00:00.000Z" });
      result.current.mutate({ kind: "task", id: "t-1", body: { due_at: "2026-11-09T06:00:00.000Z" }, dueAt: "2026-11-09T06:00:00.000Z" });
    });
    await waitFor(() => expect(rowsOf(client, deadlinesKey)[0]).toMatchObject({ due_at: "2026-11-09T05:00:00.000Z" }));
    await waitFor(() => expect(rowsOf(client, tasksKey)[0]).toMatchObject({ due_at: "2026-11-09T06:00:00.000Z" }));
  });

  it("rolls the block back and says so when the server refuses", async () => {
    apiFetch.mockRejectedValue(new ApiError("nope", 400));
    const { client, result } = setup();
    await act(async () => {
      await result.current.mutateAsync(appointmentEdit).catch(() => {});
    });
    expect(rowsOf(client, appointmentsKey)[0]).toMatchObject({ id: "a-1", date: "2026-11-05", time: "10:00", duration_minutes: 60 });
    expect(await screen.findByText("Could not move that appointment")).toBeInTheDocument();
  });

  it("refetches afterwards — success or failure — including reminders, since a due date change moves them", async () => {
    apiFetch.mockResolvedValue({ data: {} });
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current.mutateAsync({ kind: "task", id: "t-1", body: { due_at: "2026-11-09T06:00:00.000Z" }, dueAt: "2026-11-09T06:00:00.000Z" });
    });
    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(taskKeys.all));
    expect(invalidatedKeys).toContain(JSON.stringify(reminderKeys.all));
  });

  describe("concurrent edits", () => {
    const deferred = () => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const otherEdit: CalendarEdit = { kind: "appointment", id: "a-2", body: { date: "2026-11-07", time: "09:00", duration_minutes: 30 }, dueAt: null };
    const appointmentInvalidations = (invalidate: { mock: { calls: unknown[][] } }) =>
      (invalidate.mock.calls as Array<[{ queryKey?: unknown }?]>).filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(appointmentKeys.all)).length;

    it("does not refetch while another edit is still in flight, so the refetch can't undo that edit's optimistic move", async () => {
      const first = deferred();
      const second = deferred();
      apiFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { client, result } = setup();
      const invalidate = vi.spyOn(client, "invalidateQueries");

      act(() => {
        result.current.mutate(appointmentEdit);
        result.current.mutate(otherEdit);
      });
      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));

      await act(async () => {
        first.resolve({ data: {} });
      });
      expect(appointmentInvalidations(invalidate)).toBe(0);
      // The still-pending edit keeps its optimistic position.
      expect(rowsOf(client, appointmentsKey)[1]).toMatchObject({ id: "a-2", date: "2026-11-07", time: "09:00" });

      await act(async () => {
        second.resolve({ data: {} });
      });
      await waitFor(() => expect(appointmentInvalidations(invalidate)).toBe(1));
    });

    it("rolls back only the failed edit's row, leaving another in-flight edit's optimistic move alone", async () => {
      const first = deferred();
      const second = deferred();
      apiFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { client, result } = setup();

      act(() => {
        result.current.mutate(appointmentEdit);
        result.current.mutate(otherEdit);
      });
      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));

      await act(async () => {
        first.reject(new ApiError("nope", 400));
      });
      expect(rowsOf(client, appointmentsKey)[0]).toMatchObject({ id: "a-1", date: "2026-11-05", time: "10:00", duration_minutes: 60 });
      expect(rowsOf(client, appointmentsKey)[1]).toMatchObject({ id: "a-2", date: "2026-11-07", time: "09:00", duration_minutes: 30 });

      await act(async () => {
        second.resolve({ data: {} });
      });
    });
  });
});
