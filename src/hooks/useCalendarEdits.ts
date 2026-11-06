import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { appointmentKeys, deadlineKeys, reminderKeys, taskKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/Toast";
import type { CalendarEdit, EditableKind } from "@/lib/calendar/edit-patches";

type ListPage = { rows: Array<{ id: string }>; meta?: unknown };

const ROUTE: Record<EditableKind, string> = {
  appointment: "appointments",
  deadline: "deadlines",
  task: "tasks",
};

const LABEL: Record<EditableKind, string> = {
  appointment: "appointment",
  deadline: "deadline",
  task: "task",
};

const KEYS_ALL: Record<EditableKind, readonly string[]> = {
  appointment: appointmentKeys.all,
  deadline: deadlineKeys.all,
  task: taskKeys.all,
};

/** Every list query of the edited entity — [...all, "list", filters] — but not its detail queries, which have a different shape. */
function listQueryKey(kind: EditableKind): QueryKey {
  return [...KEYS_ALL[kind], "list"];
}

/** What onMutate recorded to undo exactly this edit: for each cached list holding the row, the row's own pre-edit values for the fields the edit changes. */
interface Undo {
  queryKey: QueryKey;
  previous: Record<string, unknown>;
}

const MUTATION_KEY = ["calendar-edit"] as const;

/**
 * Writes a calendar drag/resize/dialog change: PATCH /api/{appointments|
 * deadlines|tasks}/{id} with the body buildCalendarEdit made.
 *
 * Optimistic: the block moves in every cached list straight away (the grid is
 * rebuilt from those caches on each render). A refusal undoes only that row's
 * edited fields — not a whole-page snapshot, which would also revert another
 * edit still in flight — and shows a toast.
 *
 * Refetches afterwards, including reminders (the PATCH routes re-derive a
 * reminder's fire time from the new date) — but only when this is the last
 * calendar edit in flight: a refetch that lands while another edit is still
 * pending returns server state without that edit and would visibly snap its
 * block back until it settles.
 */
export function useApplyCalendarEdit() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation<unknown, Error, CalendarEdit, { undo: Undo[] }>({
    mutationKey: MUTATION_KEY,
    mutationFn: async (edit) => {
      if (edit.series) return (await apiFetch(`/api/deadlines/${edit.id}/series-shift`, { method: "POST", body: { due_at: edit.body.due_at } })).data;
      return (await apiFetch(`/api/${ROUTE[edit.kind]}/${edit.id}`, { method: "PATCH", body: edit.body })).data;
    },
    onMutate: async (edit) => {
      const queryKey = listQueryKey(edit.kind);
      await queryClient.cancelQueries({ queryKey });
      const fields = Object.keys(edit.body);
      const undo: Undo[] = [];
      for (const [key, page] of queryClient.getQueriesData<ListPage>({ queryKey })) {
        const row = page?.rows.find((candidate) => candidate.id === edit.id);
        if (!row) continue;
        undo.push({ queryKey: key, previous: Object.fromEntries(fields.map((field) => [field, (row as Record<string, unknown>)[field]])) });
      }
      queryClient.setQueriesData<ListPage>({ queryKey }, (page) =>
        page ? { ...page, rows: page.rows.map((row) => (row.id === edit.id ? { ...row, ...edit.body } : row)) } : page,
      );
      return { undo };
    },
    onError: (_error, edit, context) => {
      for (const { queryKey, previous } of context?.undo ?? []) {
        queryClient.setQueryData<ListPage>(queryKey, (page) =>
          page ? { ...page, rows: page.rows.map((row) => (row.id === edit.id ? { ...row, ...previous } : row)) } : page,
        );
      }
      showToast(`Could not move that ${LABEL[edit.kind]}`, "error");
    },
    onSettled: (_data, _error, edit) => {
      // The settling edit still counts as in flight here, hence 1 (the documented TanStack pattern).
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      queryClient.invalidateQueries({ queryKey: KEYS_ALL[edit.kind] });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      // An appointment can be a deadline's session: its date feeds that deadline's progress and Up Next.
      if (edit.kind === "appointment") queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}
