import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { courseKeys, deadlineKeys, noteKeys, reminderKeys } from "@/lib/query/keys";
import type { CoursePatch, CoursePayload } from "@/lib/api/schemas";
import type { CourseRow } from "@/lib/api/entity-types";

export interface CourseListFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** "me" for the account owner's own courses, or a People row's id (People feature). */
  personId?: string;
}

export interface CourseDeleteResult {
  id: string;
  cascade: { deadlinesDeleted: number; remindersDismissed: number; notesUnlinked: number };
}

export function useCourses(filters?: CourseListFilters) {
  return useQuery({
    queryKey: courseKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<CourseRow[]>(`/api/courses${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: courseKeys.detail(id),
    queryFn: async () => (await apiFetch<CourseRow>(`/api/courses/${id}`)).data,
    enabled: Boolean(id),
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CoursePayload) => (await apiFetch<CourseRow>("/api/courses", { method: "POST", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useUpdateCourse(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CoursePatch) =>
      (await apiFetch<CourseRow>(`/api/courses/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

export function useDeleteCourse(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<CourseDeleteResult>(`/api/courses/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      // The cascade also soft-deletes the course's own live deadlines (not
      // just dismissing their reminders — see cascadeDeleteCourse in
      // src/lib/api/cascade.ts, sourced from soft_delete_course_cascade in
      // supabase/migrations/0002_delete_cascade.sql) and unlinks their
      // notes — invalidate all three alongside the course lists/detail.
      // Removed, not just invalidated, for the course's own detail key: see
      // useDeleteTask's onSuccess for why.
      queryClient.removeQueries({ queryKey: courseKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
    },
  });
}
