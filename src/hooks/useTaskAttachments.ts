import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { attachmentKeys } from "@/lib/query/keys";
import type { AttachmentPatch } from "@/lib/api/schemas";
import type { TaskAttachmentRow } from "@/lib/api/entity-types";

export function useTaskAttachments(taskId: string) {
  return useQuery({
    queryKey: attachmentKeys.list({ taskId }),
    queryFn: async () =>
      (await apiFetch<TaskAttachmentRow[]>(`/api/task-attachments${toQueryString({ taskId })}`)).data,
    enabled: Boolean(taskId),
  });
}

export interface CreateLinkAttachmentInput {
  task_id: string;
  title: string;
  url: string;
}

export function useCreateLinkAttachment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLinkAttachmentInput) =>
      (
        await apiFetch<TaskAttachmentRow>("/api/task-attachments", {
          method: "POST",
          body: { ...input, kind: "link" },
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list({ taskId }) });
    },
  });
}

export interface CreateFileAttachmentInput {
  task_id: string;
  title: string;
  file: File;
}

function toFormData(input: CreateFileAttachmentInput): FormData {
  const formData = new FormData();
  formData.set("task_id", input.task_id);
  formData.set("kind", "file");
  formData.set("title", input.title);
  formData.set("file", input.file);
  return formData;
}

export function useCreateFileAttachment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFileAttachmentInput) =>
      (await apiFetch<TaskAttachmentRow>("/api/task-attachments", { method: "POST", body: toFormData(input) })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list({ taskId }) });
    },
  });
}

export function useUpdateTaskAttachment(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AttachmentPatch) =>
      (await apiFetch<TaskAttachmentRow>(`/api/task-attachments/${id}`, { method: "PATCH", body: payload })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list({ taskId }) });
    },
  });
}

export function useDeleteTaskAttachment(id: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiFetch<{ id: string }>(`/api/task-attachments/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list({ taskId }) });
    },
  });
}
