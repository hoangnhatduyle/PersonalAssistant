"use client";

import { useMemo, useState } from "react";
import { useCreateNote, useNotes } from "@/hooks/useNotes";
import { useCourses } from "@/hooks/useCourses";
import { useTasks } from "@/hooks/useTasks";
import { NoteForm } from "@/components/notes/NoteForm";
import { NoteCard } from "@/components/notes/NoteCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { NotePayload } from "@/lib/api/schemas";

export function NoteListContainer() {
  const { data, isLoading } = useNotes();
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const createNote = useCreateNote();
  const { showToast } = useToast();
  const [showComposer, setShowComposer] = useState(false);

  const courseNameById = useMemo(() => new Map((courses?.rows ?? []).map((course) => [course.id, course.name])), [courses]);
  const taskTitleById = useMemo(() => new Map((tasks?.rows ?? []).map((task) => [task.id, task.title])), [tasks]);

  const handleCreate = async (values: NotePayload) => {
    try {
      await createNote.mutateAsync(values);
      showToast("Note created", "success");
      setShowComposer(false);
    } catch {
      showToast("Could not create note", "error");
    }
  };

  const notes = data?.rows ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Notes</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Field notes</h1>
        </div>
        {!showComposer && <Button onClick={() => setShowComposer(true)}>New note</Button>}
      </div>

      {showComposer && (
        <GlassPanel className="p-4">
          <NoteForm onSubmit={handleCreate} onCancel={() => setShowComposer(false)} submitLabel="Add note" />
        </GlassPanel>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-full" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Capture a thought and link it to a course or task." />
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              courseName={note.linked_course_id ? courseNameById.get(note.linked_course_id) : undefined}
              taskTitle={note.linked_task_id ? taskTitleById.get(note.linked_task_id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
