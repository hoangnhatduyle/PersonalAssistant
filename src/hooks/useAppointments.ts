import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { appointmentKeys, reminderKeys } from "@/lib/query/keys";
import type { AppointmentPatch, AppointmentPayload } from "@/lib/api/schemas";
import type { AppointmentRow } from "@/lib/api/entity-types";

export interface AppointmentListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
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
    },
  });
}
