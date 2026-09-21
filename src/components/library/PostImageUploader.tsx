"use client";

import { useId, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { UploadItem, UploadStatus } from "@/hooks/useLibraryPostImages";

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

const STATUS_TEXT: Record<Exclude<UploadStatus, "error">, string> = {
  staged: "Ready to upload",
  queued: "Waiting…",
  uploading: "Uploading…",
  done: "Uploaded",
};

type Props = {
  items: UploadItem[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** Free screenshot slots left on the post (10 max). */
  remainingSlots: number;
  disabled?: boolean;
  /** Hide the picker (post-create progress view) and show only the queue. */
  queueOnly?: boolean;
};

/** Screenshot picker + upload queue: multi-select or drag-drop, previews, per-file status and retry. */
export function PostImageUploader({ items, onAdd, onRemove, onRetry, remainingSlots, disabled = false, queueOnly = false }: Props) {
  const inputId = useId();
  const [isDragging, setDragging] = useState(false);
  const canAdd = !disabled && remainingSlots > 0;

  const handleFiles = (list: FileList | null) => {
    if (!list || !canAdd) return;
    const images = Array.from(list).filter((file) => ACCEPTED_IMAGE_TYPES.split(",").includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    if (images.length > 0) onAdd(images);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-3">
      {!queueOnly && (
        <div>
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              if (canAdd) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-panel border border-dashed px-4 py-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-indigo ${
              isDragging ? "border-accent-indigo bg-accent-indigo/10" : "border-panel-border hover:border-panel-border-hover"
            } ${canAdd ? "" : "cursor-not-allowed opacity-50"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-6 w-6 text-text-secondary" aria-hidden="true">
              <path d="M12 16V5m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm text-text-primary">Add screenshots</span>
            <span className="text-xs text-text-secondary">
              {remainingSlots > 0 ? `Drop images here or browse · JPEG, PNG, WebP · ${remainingSlots} slot${remainingSlots === 1 ? "" : "s"} left` : "This post has reached 10 screenshots"}
            </span>
            <input
              id={inputId}
              type="file"
              multiple
              accept={ACCEPTED_IMAGE_TYPES}
              disabled={!canAdd}
              className="sr-only"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Screenshots to upload">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-control border border-panel-border bg-bg-void-elevated p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not optimisable */}
              <img src={item.previewUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-control object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{item.file.name}</p>
                <p
                  role={item.status === "error" ? "alert" : "status"}
                  className={`text-xs ${item.status === "error" ? "text-status-urgent" : item.status === "done" ? "text-status-ok" : "text-text-secondary"}`}
                >
                  {item.status === "error" ? (item.error ?? "Upload failed") : STATUS_TEXT[item.status]}
                </p>
              </div>
              {item.status === "error" && (
                <Button variant="secondary" size="sm" onClick={() => onRetry(item.id)}>
                  Retry
                </Button>
              )}
              {(item.status === "staged" || item.status === "error") && (
                <Button variant="ghost" size="sm" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.file.name}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
