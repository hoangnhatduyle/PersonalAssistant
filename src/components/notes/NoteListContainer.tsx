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
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { NotePayload } from "@/lib/api/schemas";

export function NoteListContainer() {
  const { data, isLoading } = useNotes({ limit: 100 });
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const createNote = useCreateNote();
  const { showToast } = useToast();
  const [showComposer, setShowComposer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const courseNameById = useMemo(() => new Map((courses?.rows ?? []).map((course) => [course.id, course.name])), [courses]);
  const taskTitleById = useMemo(() => new Map((tasks?.rows ?? []).map((task) => [task.id, task.title])), [tasks]);

  const allNotes = data?.rows ?? [];

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const note of allNotes) {
      for (const tag of note.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [allNotes]);

  const filteredNotes = useMemo(() => {
    let result = allNotes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.body.toLowerCase().includes(q) ||
          (note.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    if (activeTagFilter) {
      result = result.filter((note) => (note.tags ?? []).includes(activeTagFilter));
    }

    return result;
  }, [allNotes, searchQuery, activeTagFilter]);

  const handleCreate = async (values: NotePayload) => {
    try {
      await createNote.mutateAsync(values);
      showToast("Note created", "success");
      setShowComposer(false);
    } catch {
      showToast("Could not create note", "error");
    }
  };

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

      <div className="flex flex-col gap-3">
        <Input
          type="text"
          placeholder="Search notes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">Tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              >
                <Badge tone={activeTagFilter === tag ? "accent" : "neutral"}>
                  {tag}
                </Badge>
              </button>
            ))}
            {activeTagFilter && (
              <button
                type="button"
                onClick={() => setActiveTagFilter(null)}
                className="font-mono text-xs text-text-secondary hover:text-text-primary"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          title={searchQuery || activeTagFilter ? "No matching notes" : "No notes yet"}
          description={
            searchQuery || activeTagFilter
              ? "Try a different search or clear the tag filter."
              : "Capture a thought and link it to a course or task."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredNotes.map((note) => (
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
