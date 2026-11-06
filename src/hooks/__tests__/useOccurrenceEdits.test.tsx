import type { ReactNode } from "react";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import { appointmentKeys, courseKeys } from "@/lib/query/keys";
import { CALENDAR_APPOINTMENT_FILTERS, CALENDAR_LIST_FILTERS } from "@/lib/calendar/query-filters";
import { ToastProvider } from "@/components/ui/Toast";
import { useApplyOccurrenceEdit, type OccurrenceEdit } from "@/hooks/useOccurrenceEdits";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/http/client")>()), apiFetch }));

type Override = { original_date: string; original_start_minutes: number; is_cancelled: boolean; new_date: string | null; new_start_minutes: number | null; new_end_minutes: number | null };
type Row = { id: string; meeting_blocks: MeetingBlock[]; occurrence_overrides: Override[] };
const page = (rows: Row[]) => ({ rows, meta: { total: rows.length, page: 1, limit: 100 } });

const THURSDAY_BLOCK: MeetingBlock = { days: [4], startMinutes: 510, endMinutes: 990 };
const moved = (date: string, start: number, end: number, originalDate = date): Override => ({
  original_date: originalDate,
  original_start_minutes: 510,
  is_cancelled: false,
  new_date: date,
  new_start_minutes: start,
  new_end_minutes: end,
});

const coursesKey = courseKeys.list(CALENDAR_LIST_FILTERS);
const appointmentsKey = appointmentKeys.list(CALENDAR_APPOINTMENT_FILTERS);

function setup(initialOverrides: Override[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(coursesKey, page([{ id: "c-1", meeting_blocks: [THURSDAY_BLOCK], occurrence_overrides: initialOverrides }]));
  client.setQueryData(appointmentsKey, page([{ id: "a-1", meeting_blocks: [{ days: [2], startMinutes: 540, endMinutes: 600 }], occurrence_overrides: [] }]));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useApplyOccurrenceEdit(), { wrapper });
  return { client, result };
}

const courseRow = (client: QueryClient) => (client.getQueryData(coursesKey) as ReturnType<typeof page>).rows[0];

const moveThisThursday: OccurrenceEdit = {
  scope: "this",
  parent: "course",
  id: "c-1",
  originalDate: "2030-03-14",
  originalStartMinutes: 510,
  change: { type: "move", newDate: "2030-03-14", newStartMinutes: 780, newEndMinutes: 990 },
};

describe("useApplyOccurrenceEdit: requests", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("PUTs a move for one occurrence to the parent's occurrences endpoint", async () => {
    apiFetch.mockResolvedValue({ data: {} });
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync(moveThisThursday);
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/courses/c-1/occurrences", {
      method: "PUT",
      body: { original_date: "2030-03-14", original_start_minutes: 510, new_date: "2030-03-14", new_start_minutes: 780, new_end_minutes: 990 },
    });
  });

  it("PUTs a cancellation, and DELETEs to revert", async () => {
    apiFetch.mockResolvedValue({ data: {} });
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync({ scope: "this", parent: "appointment", id: "a-1", originalDate: "2030-03-12", originalStartMinutes: 540, change: { type: "cancel" } });
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/appointments/a-1/occurrences", {
      method: "PUT",
      body: { original_date: "2030-03-12", original_start_minutes: 540, is_cancelled: true },
    });

    await act(async () => {
      await result.current.mutateAsync({ scope: "this", parent: "course", id: "c-1", originalDate: "2030-03-14", originalStartMinutes: 510, change: { type: "revert" } });
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/courses/c-1/occurrences?original_date=2030-03-14&original_start_minutes=510", { method: "DELETE" });
  });

  it("PATCHes the series' meeting_blocks for All occurrences", async () => {
    apiFetch.mockResolvedValue({ data: {} });
    const { result } = setup();
    const blocks: MeetingBlock[] = [{ days: [4], startMinutes: 780, endMinutes: 990 }];
    await act(async () => {
      await result.current.mutateAsync({ scope: "all", parent: "course", id: "c-1", meetingBlocks: blocks });
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/courses/c-1", { method: "PATCH", body: { meeting_blocks: blocks } });
  });
});

describe("useApplyOccurrenceEdit: optimistic cache", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });
  const pending = () => new Promise(() => {});

  it("adds a move to the course's embedded exceptions at once, replacing an earlier one for the same occurrence", async () => {
    apiFetch.mockReturnValue(pending());
    const { client, result } = setup([moved("2030-03-14", 600, 660), moved("2030-03-21", 600, 660)]);
    act(() => result.current.mutate(moveThisThursday));
    await waitFor(() => expect(courseRow(client).occurrence_overrides).toHaveLength(2));
    expect(courseRow(client).occurrence_overrides).toContainEqual(moved("2030-03-14", 780, 990));
    expect(courseRow(client).occurrence_overrides).toContainEqual(moved("2030-03-21", 600, 660));
    expect(courseRow(client).occurrence_overrides.filter((o) => o.new_start_minutes === 600)).toHaveLength(1);
  });

  it("records a cancellation with no new time", async () => {
    apiFetch.mockReturnValue(pending());
    const { client, result } = setup();
    act(() => result.current.mutate({ ...moveThisThursday, change: { type: "cancel" } }));
    await waitFor(() => expect(courseRow(client).occurrence_overrides).toHaveLength(1));
    expect(courseRow(client).occurrence_overrides[0]).toEqual({
      original_date: "2030-03-14",
      original_start_minutes: 510,
      is_cancelled: true,
      new_date: null,
      new_start_minutes: null,
      new_end_minutes: null,
    });
  });

  it("removes the exception on revert, and only that one", async () => {
    apiFetch.mockReturnValue(pending());
    const { client, result } = setup([moved("2030-03-14", 780, 990), moved("2030-03-21", 600, 660)]);
    act(() => result.current.mutate({ ...moveThisThursday, change: { type: "revert" } }));
    await waitFor(() => expect(courseRow(client).occurrence_overrides).toHaveLength(1));
    expect(courseRow(client).occurrence_overrides[0].original_date).toBe("2030-03-21");
  });

  it("replaces the pattern for All occurrences and drops future exceptions but keeps past ones", async () => {
    apiFetch.mockReturnValue(pending());
    const { client, result } = setup([moved("2020-03-12", 600, 660), moved("2099-03-14", 600, 660)]);
    const blocks: MeetingBlock[] = [{ days: [4], startMinutes: 780, endMinutes: 990 }];
    act(() => result.current.mutate({ scope: "all", parent: "course", id: "c-1", meetingBlocks: blocks }));
    await waitFor(() => expect(courseRow(client).meeting_blocks).toEqual(blocks));
    expect(courseRow(client).occurrence_overrides.map((o) => o.original_date)).toEqual(["2020-03-12"]);
  });

  it("works on a recurring appointment's cache the same way", async () => {
    apiFetch.mockReturnValue(pending());
    const { client, result } = setup();
    act(() =>
      result.current.mutate({ scope: "this", parent: "appointment", id: "a-1", originalDate: "2030-03-12", originalStartMinutes: 540, change: { type: "cancel" } }),
    );
    await waitFor(() => expect((client.getQueryData(appointmentsKey) as ReturnType<typeof page>).rows[0].occurrence_overrides).toHaveLength(1));
  });
});

describe("useApplyOccurrenceEdit: failure and concurrency", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("restores the row exactly and says so when the server refuses", async () => {
    apiFetch.mockRejectedValue(new ApiError("nope", 400));
    const original = [moved("2030-03-21", 600, 660)];
    const { client, result } = setup(original);
    await act(async () => {
      await result.current.mutateAsync(moveThisThursday).catch(() => {});
    });
    expect(courseRow(client).occurrence_overrides).toEqual(original);
    expect(courseRow(client).meeting_blocks).toEqual([THURSDAY_BLOCK]);
    expect(await screen.findByText("Could not change that occurrence")).toBeInTheDocument();
  });

  it("says 'series' when an All occurrences change is refused, and restores the pattern", async () => {
    apiFetch.mockRejectedValue(new ApiError("nope", 400));
    const { client, result } = setup([moved("2099-03-14", 600, 660)]);
    await act(async () => {
      await result.current.mutateAsync({ scope: "all", parent: "course", id: "c-1", meetingBlocks: [{ days: [4], startMinutes: 780, endMinutes: 990 }] }).catch(() => {});
    });
    expect(courseRow(client).meeting_blocks).toEqual([THURSDAY_BLOCK]);
    expect(courseRow(client).occurrence_overrides).toHaveLength(1);
    expect(await screen.findByText("Could not change that series")).toBeInTheDocument();
  });

  it("does not refetch while another occurrence edit is still in flight", async () => {
    let resolveFirst!: (value: unknown) => void;
    apiFetch.mockReturnValueOnce(new Promise((r) => (resolveFirst = r))).mockReturnValueOnce(new Promise(() => {}));
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => {
      result.current.mutate(moveThisThursday);
      result.current.mutate({ ...moveThisThursday, originalDate: "2030-03-21", change: { type: "cancel" } });
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveFirst({ data: {} });
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
