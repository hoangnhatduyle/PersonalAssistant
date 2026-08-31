"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NoteForm } from "@/components/notes/NoteForm";
import { useDeleteNote, useUpdateNote } from "@/hooks/useNotes";
import { useToast } from "@/components/ui/Toast";
import type { NoteRow } from "@/lib/api/entity-types";
import type { NotePayload } from "@/lib/api/schemas";

type Props = {
  note: NoteRow;
  courseName?: string;
  taskTitle?: string;
};

export function NoteCard({ note, courseName, taskTitle }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNote = useUpdateNote(note.id);
  const deleteNote = useDeleteNote(note.id);
  const { showToast } = useToast();

  const handleUpdate = async (values: NotePayload) => {
    try {
      await updateNote.mutateAsync(values);
      showToast("Note updated", "success");
      setIsEditing(false);
    } catch {
      showToast("Could not update note", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteNote.mutateAsync();
      showToast("Note deleted", "success");
    } catch {
      showToast("Could not delete note", "error");
    }
  };

  if (isEditing) {
    return (
      <GlassPanel className="p-4">
        <NoteForm note={note} onSubmit={handleUpdate} onCancel={() => setIsEditing(false)} submitLabel="Save changes" />
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="whitespace-pre-wrap text-sm text-text-primary">{note.body}</p>
      {(courseName || taskTitle || note.linked_date) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {courseName && <Badge tone="accent">{courseName}</Badge>}
          {taskTitle && <Badge tone="accent">{taskTitle}</Badge>}
          {note.linked_date && <Badge>{note.linked_date}</Badge>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" isLoading={deleteNote.isPending} onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </GlassPanel>
  );
}
