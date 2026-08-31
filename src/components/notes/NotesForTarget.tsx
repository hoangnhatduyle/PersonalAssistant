"use client";

import { useMemo, useState } from "react";
import { useCreateNote, useNotes } from "@/hooks/useNotes";
import { NoteCard } from "@/components/notes/NoteCard";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { NoteRow } from "@/lib/api/entity-types";

type Props = {
  targetType: "course" | "task";
  targetId: string;
};

/**
 * No server-side filter param exists for Notes — filters the same
 * `useNotes()` cache client-side by the linked id. Fine at this app's scale
 * (per SPEC-CORE Phase 4 plan).
 */
export function NotesForTarget({ targetType, targetId }: Props) {
  const { data, isLoading } = useNotes();
  const createNote = useCreateNote();
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");

  const notes = useMemo<NoteRow[]>(() => {
    const rows = data?.rows ?? [];
    return rows.filter((note) =>
      targetType === "course" ? note.linked_course_id === targetId : note.linked_task_id === targetId,
    );
  }, [data, targetType, targetId]);

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await createNote.mutateAsync({
        body,
        linked_course_id: targetType === "course" ? targetId : undefined,
        linked_task_id: targetType === "task" ? targetId : undefined,
      });
      setDraft("");
      showToast("Note added", "success");
    } catch {
      showToast("Could not add note", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Notes</p>

      <div className="flex gap-2">
        <Textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note..."
          className="flex-1"
        />
        <Button variant="secondary" isLoading={createNote.isPending} onClick={handleAdd}>
          Add
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : notes.length === 0 ? (
        <EmptyState title="No notes linked yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
