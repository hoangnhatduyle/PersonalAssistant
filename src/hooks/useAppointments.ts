import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { appointmentKeys, deadlineKeys, reminderKeys } from "@/lib/query/keys";
import type { AppointmentPatch, AppointmentPayload } from "@/lib/api/schemas";
import type { AppointmentRow } from "@/lib/api/entity-types";
import type { SessionTransitionEvent } from "@/lib/api/transitions";

export interface AppointmentListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** Deadline Sessions: scopes the list to one deadline's sessions. */
  deadlineId?: string;
}

export function useAppointments(filters?: AppointmentListFilters) {
  return useQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<AppointmentRow[]>(`/api/appointments${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: async () => (await apiFetch<AppointmentRow>(`/api/appointments/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AppointmentPayload) =>
      (await apiFetch<AppointmentRow>("/api/appointments", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      // A new session changes its parent deadline's progress ratio.
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}

export function useUpdateAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AppointmentPatch) =>
      (await apiFetch<AppointmentRow>(`/api/appointments/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}

export function useDeleteAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/appointments/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: appointmentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}

/**
 * Deadline Sessions: the only way a session's session_status may change
 * (NC-API-002), mirroring useTransitionDeadline. Invalidates deadlineKeys.all
 * in addition to appointmentKeys.all because a `done` transition can flip
 * deadlines.status server-side via the DB trigger
 * (advance_deadline_on_session_done) with no other client-side signal.
 */
export function useTransitionAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: SessionTransitionEvent) =>
      (await apiFetch<AppointmentRow>(`/api/appointments/${id}/transition`, { method: "POST", body: { event } })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}
