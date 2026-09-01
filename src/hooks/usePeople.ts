import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { peopleKeys, courseKeys, deadlineKeys, taskKeys, reminderKeys, noteKeys } from "@/lib/query/keys";
import type { PersonPatch, PersonPayload } from "@/lib/api/schemas";
import type { PersonRow } from "@/lib/api/entity-types";

export interface PeopleListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface PersonDeleteResult {
  id: string;
  cascade: {
    coursesDeleted: number;
    deadlinesDeleted: number;
    tasksDeleted: number;
    remindersDismissed: number;
    notesUnlinked: number;
  };
}

export function usePeople(filters?: PeopleListFilters) {
  return useQuery({
    queryKey: peopleKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<PersonRow[]>(`/api/people${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: peopleKeys.detail(id),
    queryFn: async () => (await apiFetch<PersonRow>(`/api/people/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PersonPayload) => (await apiFetch<PersonRow>("/api/people", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

export function useUpdatePerson(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PersonPatch) =>
      (await apiFetch<PersonRow>(`/api/people/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
  });
}

export function useDeletePerson(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<PersonDeleteResult>(`/api/people/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // The cascade also soft-deletes the person's live courses/deadlines/
      // tasks (dismissing reminders) and unlinks notes — see
      // cascadeDeletePerson in src/lib/api/cascade.ts, sourced from
      // soft_delete_person_cascade in supabase/migrations/0013_people.sql —
      // invalidate all of those alongside the people lists/detail. Removed,
      // not just invalidated, for the person's own detail key: see
      // useDeleteTask's onSuccess for why.
      queryClient.removeQueries({ queryKey: peopleKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
