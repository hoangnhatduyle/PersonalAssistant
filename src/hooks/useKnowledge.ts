import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, toQueryString } from "@/lib/http/client";
import { knowledgeKeys } from "@/lib/query/keys";
import type { KnowledgeSource, KnowledgeSourceStatus, KnowledgeSourceType } from "@/lib/api/entity-types";

export interface KnowledgeListFilters {
  status?: KnowledgeSourceStatus;
  page?: number;
  limit?: number;
}

const ACTIVE_KNOWLEDGE_STATUSES: readonly KnowledgeSourceStatus[] = ["Pending", "Processing"];
const KNOWLEDGE_POLL_INTERVAL_MS = 4000;

export function useKnowledgeSources(filters?: KnowledgeListFilters) {
  return useQuery({
    queryKey: knowledgeKeys.list(filters),
    queryFn: async () => {
      const { data, meta } = await apiFetch<KnowledgeSource[]>(`/api/knowledge${toQueryString(filters ?? {})}`);
      return { rows: data, meta };
    },
    // Self-terminating: polls only while at least one row is still
    // Pending/Processing, stops once every row reaches Ready/Failed.
    refetchInterval: (query) => {
      const rows = query.state.data?.rows ?? [];
      const hasActive = rows.some((row) => ACTIVE_KNOWLEDGE_STATUSES.includes(row.status));
      return hasActive ? KNOWLEDGE_POLL_INTERVAL_MS : false;
    },
  });
}

export function useKnowledgeSource(id: string) {
  return useQuery({
    queryKey: knowledgeKeys.detail(id),
    queryFn: async () => (await apiFetch<KnowledgeSource>(`/api/knowledge/${id}`)).data,
    enabled: Boolean(id),
  });
}

export interface CreateKnowledgeSourceInput {
  source_type: KnowledgeSourceType;
  title: string;
  url?: string;
  text?: string;
  file?: File;
}

function toFormData(input: CreateKnowledgeSourceInput): FormData {
  const formData = new FormData();
  formData.set("source_type", input.source_type);
  formData.set("title", input.title);
  if (input.url) formData.set("url", input.url);
  if (input.text) formData.set("text", input.text);
  if (input.file) formData.set("file", input.file);
  return formData;
}

export function useCreateKnowledgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateKnowledgeSourceInput) =>
      (await apiFetch<KnowledgeSource>("/api/knowledge", { method: "POST", body: toFormData(input) })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
    },
  });
}

export function useDeleteKnowledgeSource(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiFetch<{ id: string }>(`/api/knowledge/${id}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
    },
  });
}

export function useRetryKnowledgeSource(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiFetch<{ id: string; status: "Processing" }>(`/api/knowledge/${id}/retry`, { method: "POST" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
    },
  });
}
