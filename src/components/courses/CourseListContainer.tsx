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
import { PersonFilterToggle, type PersonFilterValue } from "@/components/calendar/PersonFilterToggle";
import { PersonLegend } from "@/components/calendar/PersonLegend";
import type { CoursePayload } from "@/lib/api/schemas";

export function CourseListContainer() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  // Defaults to "all" (overlaid) — matches WeekGridContainer's default so
  // switching between Calendar and Courses doesn't reset expectations.
  const [personFilter, setPersonFilter] = useState<PersonFilterValue>("all");
  const { data, isLoading } = useCourses();
  const { data: people, isLoading: peopleLoading } = usePeople();
  const createCourse = useCreateCourse();
  const { showToast } = useToast();

  const matchesFilter = (personId: string | null) => {
    if (personFilter === "all") return true;
    if (personFilter === "me") return personId === null;
    return personId === personFilter;
  };

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
            <PersonFilterToggle people={people?.rows ?? []} value={personFilter} onChange={setPersonFilter} label="courses" />
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
