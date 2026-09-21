import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { libraryKeys } from "@/lib/query/keys";
import { prepareImageForUpload } from "@/lib/library/client-image";
import { MAX_IMAGES_PER_POST } from "@/lib/library/constants";
import type { LibraryPostImage } from "@/lib/api/entity-types";

export type UploadStatus = "staged" | "queued" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  postId: string | null;
  error?: string;
}

interface Options {
  /** When known up front (post detail page) files upload as soon as they're added; otherwise they stay staged until start(postId). */
  postId?: string;
  /** Live images the post already has — counts toward the 10-per-post cap. */
  existingCount?: number;
  onDrained?: (items: UploadItem[]) => void;
}

/** Items that will still consume a slot once uploaded (done ones are already in existingCount after the refetch). */
const isPending = (item: UploadItem) => item.status !== "error" && item.status !== "done";

async function uploadOne(postId: string, file: File): Promise<void> {
  const prepared = await prepareImageForUpload(file);
  const body = new FormData();
  body.set("file", prepared);
  await apiFetch<LibraryPostImage>(`/api/library/posts/${postId}/images`, { method: "POST", body });
}

/**
 * Sequential screenshot upload queue — ONE request per image so each body
 * stays under Vercel's ~4.5MB limit. State lives in a ref (the source of
 * truth for the worker loop) mirrored into React state for rendering, so
 * the loop never reads a stale closure.
 */
export function useLibraryImageUploads({ postId, existingCount = 0, onDrained }: Options = {}) {
  const queryClient = useQueryClient();
  const itemsRef = useRef<UploadItem[]>([]);
  const runningRef = useRef(false);
  const onDrainedRef = useRef(onDrained);
  const [items, setItems] = useState<UploadItem[]>([]);

  useEffect(() => {
    onDrainedRef.current = onDrained;
  }, [onDrained]);

  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<UploadItem>) => commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [commit],
  );

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let didWork = false;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.status === "queued");
        if (!next || !next.postId) break;
        didWork = true;
        patch(next.id, { status: "uploading", error: undefined });
        try {
          await uploadOne(next.postId, next.file);
          patch(next.id, { status: "done" });
        } catch (error) {
          patch(next.id, { status: "error", error: error instanceof Error ? error.message : "Upload failed" });
        }
      }
    } finally {
      runningRef.current = false;
    }
    if (didWork) {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      onDrainedRef.current?.(itemsRef.current);
    }
  }, [patch, queryClient]);

  const add = useCallback(
    (files: File[]) => {
      const room = Math.max(0, MAX_IMAGES_PER_POST - existingCount - itemsRef.current.filter(isPending).length);
      const accepted = files.slice(0, room).map<UploadItem>((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: postId ? "queued" : "staged",
        postId: postId ?? null,
      }));
      if (accepted.length === 0) return 0;
      commit([...itemsRef.current, ...accepted]);
      if (postId) void pump();
      return accepted.length;
    },
    [commit, existingCount, postId, pump],
  );

  const remove = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target || target.status === "uploading") return;
      URL.revokeObjectURL(target.previewUrl);
      commit(itemsRef.current.filter((item) => item.id !== id));
    },
    [commit],
  );

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: "queued", error: undefined });
      void pump();
    },
    [patch, pump],
  );

  /** Create flow: the post now exists — queue everything that was staged. */
  const start = useCallback(
    (newPostId: string) => {
      commit(itemsRef.current.map((item) => (item.status === "staged" ? { ...item, status: "queued", postId: newPostId } : item)));
      void pump();
    },
    [commit, pump],
  );

  /** Drop finished/failed rows (keeps staged + in-flight). */
  const clearSettled = useCallback(() => {
    for (const item of itemsRef.current) if (item.status === "done" || item.status === "error") URL.revokeObjectURL(item.previewUrl);
    commit(itemsRef.current.filter((item) => item.status !== "done" && item.status !== "error"));
  }, [commit]);

  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const isUploading = items.some((item) => item.status === "queued" || item.status === "uploading");
  const remainingSlots = Math.max(0, MAX_IMAGES_PER_POST - existingCount - items.filter(isPending).length);

  return { items, add, remove, retry, start, clearSettled, isUploading, remainingSlots };
}

export function useDeleteLibraryPostImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) =>
      (await apiFetch<{ id: string }>(`/api/library/post-images/${imageId}`, { method: "DELETE" })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
