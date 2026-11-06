import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { appointmentKeys, courseKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/Toast";
import { futureOverrideCutoff } from "@/lib/api/series-pattern";
import type { OccurrenceOverride } from "@/lib/calendar/occurrence-overrides";
import type { MeetingBlock } from "@/lib/calendar/recurrence";

export type OccurrenceParent = "course" | "appointment";

export type OccurrenceChange =
  | { type: "move"; newDate: string; newStartMinutes: number; newEndMinutes: number }
  | { type: "cancel" }
  | { type: "revert" };

/** One edit to a recurring course/appointment: a single occurrence ("this"), or the whole weekly pattern ("all"). */
export type OccurrenceEdit =
  | { scope: "this"; parent: OccurrenceParent; id: string; originalDate: string; originalStartMinutes: number; change: OccurrenceChange }
  | { scope: "all"; parent: OccurrenceParent; id: string; meetingBlocks: MeetingBlock[] };

interface SeriesRow {
  id: string;
  meeting_blocks: MeetingBlock[];
  occurrence_overrides?: OccurrenceOverride[] | null;
}
type ListPage = { rows: SeriesRow[]; meta?: unknown };

const ROUTE: Record<OccurrenceParent, string> = { course: "courses", appointment: "appointments" };
const KEYS_ALL: Record<OccurrenceParent, readonly string[]> = { course: courseKeys.all, appointment: appointmentKeys.all };
const MUTATION_KEY = ["occurrence-edit"] as const;

const listQueryKey = (parent: OccurrenceParent): QueryKey => [...KEYS_ALL[parent], "list"];
const sameOccurrence = (override: OccurrenceOverride, date: string, start: number) =>
  override.original_date === date && override.original_start_minutes === start;

function toOverride(edit: Extract<OccurrenceEdit, { scope: "this" }>): OccurrenceOverride | null {
  const base = { original_date: edit.originalDate, original_start_minutes: edit.originalStartMinutes };
  const { change } = edit;
  if (change.type === "revert") return null;
  if (change.type === "cancel") return { ...base, is_cancelled: true, new_date: null, new_start_minutes: null, new_end_minutes: null };
  return { ...base, is_cancelled: false, new_date: change.newDate, new_start_minutes: change.newStartMinutes, new_end_minutes: change.newEndMinutes };
}

function request(edit: OccurrenceEdit): Promise<unknown> {
  const base = `/api/${ROUTE[edit.parent]}/${edit.id}`;
  if (edit.scope === "all") return apiFetch(base, { method: "PATCH", body: { meeting_blocks: edit.meetingBlocks } });
  const { change } = edit;
  if (change.type === "revert") {
    return apiFetch(`${base}/occurrences?original_date=${edit.originalDate}&original_start_minutes=${edit.originalStartMinutes}`, { method: "DELETE" });
  }
  const key = { original_date: edit.originalDate, original_start_minutes: edit.originalStartMinutes };
  const body =
    change.type === "cancel"
      ? { ...key, is_cancelled: true }
      : { ...key, new_date: change.newDate, new_start_minutes: change.newStartMinutes, new_end_minutes: change.newEndMinutes };
  return apiFetch(`${base}/occurrences`, { method: "PUT", body });
}

/** The row after the edit, applied to its cached copy. */
function applyToRow(row: SeriesRow, edit: OccurrenceEdit, cutoff: string): SeriesRow {
  const overrides = row.occurrence_overrides ?? [];
  if (edit.scope === "all") {
    return { ...row, meeting_blocks: edit.meetingBlocks, occurrence_overrides: overrides.filter((o) => o.original_date < cutoff) };
  }
  const rest = overrides.filter((o) => !sameOccurrence(o, edit.originalDate, edit.originalStartMinutes));
  const next = toOverride(edit);
  return { ...row, occurrence_overrides: next ? [...rest, next] : rest };
}

/** What to put back for one cached row if the edit is refused — scoped to what the edit touched, so another in-flight edit on the same row survives. */
type Undo = { queryKey: QueryKey; rowId: string; restore: (row: SeriesRow) => SeriesRow };

function buildUndo(queryKey: QueryKey, row: SeriesRow, edit: OccurrenceEdit, cutoff: string): Undo {
  const overrides = row.occurrence_overrides ?? [];
  if (edit.scope === "all") {
    const dropped = overrides.filter((o) => o.original_date >= cutoff);
    return {
      queryKey,
      rowId: row.id,
      restore: (current) => {
        const kept = current.occurrence_overrides ?? [];
        const missing = dropped.filter((d) => !kept.some((o) => sameOccurrence(o, d.original_date, d.original_start_minutes)));
        return { ...current, meeting_blocks: row.meeting_blocks, occurrence_overrides: [...kept, ...missing] };
      },
    };
  }
  const previous = overrides.find((o) => sameOccurrence(o, edit.originalDate, edit.originalStartMinutes));
  return {
    queryKey,
    rowId: row.id,
    restore: (current) => {
      const rest = (current.occurrence_overrides ?? []).filter((o) => !sameOccurrence(o, edit.originalDate, edit.originalStartMinutes));
      return { ...current, occurrence_overrides: previous ? [...rest, previous] : rest };
    },
  };
}

/**
 * Writes an edit to a recurring course/appointment made from the calendar:
 * one occurrence (PUT/DELETE .../occurrences — an exception row) or the whole
 * weekly pattern (PATCH meeting_blocks, which also drops future exceptions
 * server-side; the cache mirrors that).
 *
 * Optimistic against the cached lists the grid renders from, undone per row
 * and per occurrence on a refusal, and refetched only when it is the last
 * occurrence edit in flight (same reasoning as useApplyCalendarEdit).
 */
export function useApplyOccurrenceEdit() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation<unknown, Error, OccurrenceEdit, { undo: Undo[] }>({
    mutationKey: MUTATION_KEY,
    mutationFn: request,
    onMutate: async (edit) => {
      const queryKey = listQueryKey(edit.parent);
      await queryClient.cancelQueries({ queryKey });
      const cutoff = futureOverrideCutoff(new Date());
      const undo: Undo[] = [];
      for (const [key, page] of queryClient.getQueriesData<ListPage>({ queryKey })) {
        const row = page?.rows.find((candidate) => candidate.id === edit.id);
        if (row) undo.push(buildUndo(key, row, edit, cutoff));
      }
      queryClient.setQueriesData<ListPage>({ queryKey }, (page) =>
        page ? { ...page, rows: page.rows.map((row) => (row.id === edit.id ? applyToRow(row, edit, cutoff) : row)) } : page,
      );
      return { undo };
    },
    onError: (_error, edit, context) => {
      for (const { queryKey, rowId, restore } of context?.undo ?? []) {
        queryClient.setQueryData<ListPage>(queryKey, (page) =>
          page ? { ...page, rows: page.rows.map((row) => (row.id === rowId ? restore(row) : row)) } : page,
        );
      }
      showToast(edit.scope === "all" ? "Could not change that series" : "Could not change that occurrence", "error");
    },
    onSettled: (_data, _error, edit) => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      queryClient.invalidateQueries({ queryKey: KEYS_ALL[edit.parent] });
    },
  });
}
