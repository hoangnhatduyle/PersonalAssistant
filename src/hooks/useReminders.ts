import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { feedbackKeys, reminderKeys } from "@/lib/query/keys";
import type { ReminderAckPayload } from "@/lib/api/schemas";
import type { ReminderRow, ReminderStatus } from "@/lib/api/entity-types";

export interface ReminderListFilters {
  /** Omitting this returns every state — GET /api/reminders has no default filter. */
  state?: ReminderStatus[];
  page?: number;
  limit?: number;
}

export function useReminders(filters?: ReminderListFilters) {
  return useQuery({
    queryKey: reminderKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<ReminderRow[]>(`/api/reminders${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useAckReminder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReminderAckPayload) =>
      (await apiFetch<ReminderRow>(`/api/reminders/${id}/ack`, { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      // An Acknowledged reminder becomes eligible for a FeedbackControl.
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}
