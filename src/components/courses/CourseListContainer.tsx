"use client";

import { useState } from "react";
import { useCourses, useCreateCourse } from "@/hooks/useCourses";
import { usePeople } from "@/hooks/usePeople";
import { CourseList } from "@/components/courses/CourseList";
import { CourseForm } from "@/components/courses/CourseForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  PersonFilterToggle,
  defaultPersonFilterSelection,
  type PersonFilterSelection,
} from "@/components/calendar/PersonFilterToggle";
import { PersonLegend } from "@/components/calendar/PersonLegend";
import type { CoursePayload } from "@/lib/api/schemas";

export function CourseListContainer() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  // null = untouched, falls back to everyone overlaid — matches
  // WeekGridContainer's default so switching between Calendar and Courses
  // doesn't reset expectations. Each person can be toggled independently.
  const [personFilter, setPersonFilter] = useState<PersonFilterSelection | null>(null);
  const { data, isLoading } = useCourses();
  const { data: people, isLoading: peopleLoading } = usePeople();
  const createCourse = useCreateCourse();
  const { showToast } = useToast();

  const selection = personFilter ?? defaultPersonFilterSelection(people?.rows ?? []);
  const matchesFilter = (personId: string | null) => selection.has(personId ?? "me");

  const courses = (data?.rows ?? []).filter((course) => matchesFilter(course.person_id));

  const handleCreate = async (values: CoursePayload) => {
    try {
      await createCourse.mutateAsync(values);
      showToast("Course created", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not create course", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Courses</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Course roster</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(people?.rows.length ?? 0) > 0 && (
            <PersonFilterToggle people={people?.rows ?? []} value={selection} onChange={setPersonFilter} label="courses" />
          )}
          <Button onClick={() => setCreateOpen(true)}>New course</Button>
        </div>
      </div>

      {(people?.rows.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-text-secondary">
          <PersonLegend people={people?.rows ?? []} />
        </div>
      )}

      {isLoading || peopleLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <CourseList courses={courses} people={people?.rows ?? []} />
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="New course" size="xl">
        <CourseForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Create course" />
      </Dialog>
    </div>
  );
}
