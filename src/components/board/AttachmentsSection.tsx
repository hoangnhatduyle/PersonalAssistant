"use client";

import { useState } from "react";
import {
  useTaskAttachments,
  useCreateLinkAttachment,
  useCreateFileAttachment,
  useUpdateTaskAttachment,
  useDeleteTaskAttachment,
} from "@/hooks/useTaskAttachments";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { TaskAttachmentRow } from "@/lib/api/entity-types";

type Props = {
  taskId: string;
};

type ComposerMode = "link" | "file";

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type RowProps = {
  attachment: TaskAttachmentRow;
  taskId: string;
};

function AttachmentRow({ attachment, taskId }: RowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(attachment.title);
  const updateAttachment = useUpdateTaskAttachment(attachment.id, taskId);
  const deleteAttachment = useDeleteTaskAttachment(attachment.id, taskId);
  const { showToast } = useToast();

  // A "link" attachment goes straight to its own external url; a "file" one
  // has no client-usable url at all (Storage is private) — it always routes
  // through the ownership-checked signed-URL redirect.
  const href =
    attachment.kind === "link" ? (attachment.url ?? "#") : `/api/task-attachments/${attachment.id}/download`;
  const sizeLabel = formatFileSize(attachment.file_size_bytes);

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    try {
      await updateAttachment.mutateAsync({ title: trimmed });
      setIsEditing(false);
    } catch {
      showToast("Could not rename attachment", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAttachment.mutateAsync();
    } catch {
      showToast("Could not delete attachment", "error");
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-control border border-panel-border px-3 py-2">
      <span aria-hidden="true">{attachment.kind === "link" ? "🔗" : "📎"}</span>

      {isEditing ? (
        <>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button type="button" size="sm" onClick={handleSaveTitle} isLoading={updateAttachment.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTitleDraft(attachment.title);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 truncate text-sm text-text-primary hover:underline"
          >
            {attachment.title}
          </a>
          {sizeLabel && <span className="shrink-0 text-xs text-text-secondary">{sizeLabel}</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            isLoading={deleteAttachment.isPending}
          >
            Delete
          </Button>
        </>
      )}
    </div>
  );
}

/** Trello-style attachments on a card, slotted below ChecklistSection, above Notes. Real file upload from day one (reuses the Knowledge-source Storage pattern) alongside plain links. */
export function AttachmentsSection({ taskId }: Props) {
  const { data: attachments, isLoading } = useTaskAttachments(taskId);
  const [mode, setMode] = useState<ComposerMode>("link");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const createLink = useCreateLinkAttachment(taskId);
  const createFile = useCreateFileAttachment(taskId);
  const { showToast } = useToast();

  const handleAddLink = async () => {
    const title = linkTitle.trim();
    const url = linkUrl.trim();
    if (!title || !url) return;
    try {
      await createLink.mutateAsync({ task_id: taskId, title, url });
      setLinkTitle("");
      setLinkUrl("");
    } catch {
      showToast("Could not add link", "error");
    }
  };

  const handleAddFile = async () => {
    const title = fileTitle.trim();
    if (!title || !file) return;
    try {
      await createFile.mutateAsync({ task_id: taskId, title, file });
      setFileTitle("");
      setFile(null);
      // The native <input type="file"> is uncontrolled — clearing `file`
      // state alone leaves its displayed filename stale. Remounting via a
      // key is simpler than holding a ref just to reset .value (same
      // approach as KnowledgeImportForm.tsx).
      setFileInputKey((key) => key + 1);
    } catch {
      showToast("Could not upload file", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Attachments</p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "link" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMode("link")}
        >
          Add link
        </Button>
        <Button
          type="button"
          variant={mode === "file" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMode("file")}
        >
          Upload file
        </Button>
      </div>

      {mode === "link" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddLink();
          }}
        >
          <Input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Title" />
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://..."
              className="flex-1"
            />
            <Button type="submit" variant="secondary" size="sm" isLoading={createLink.isPending}>
              Add
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddFile();
          }}
        >
          <Input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} placeholder="Title" />
          <div className="flex gap-2">
            <input
              key={fileInputKey}
              type="file"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected && !fileTitle.trim()) setFileTitle(selected.name);
              }}
              className="flex-1 text-sm text-text-secondary file:mr-3 file:rounded-control file:border-0 file:bg-accent-indigo/15 file:px-3 file:py-1.5 file:text-accent-indigo"
            />
            <Button type="submit" variant="secondary" size="sm" isLoading={createFile.isPending}>
              Upload
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments && attachments.length > 0 ? (
        <div className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} taskId={taskId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No attachments yet.</p>
      )}
    </div>
  );
}
