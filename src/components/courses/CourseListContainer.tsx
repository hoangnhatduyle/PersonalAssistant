"use client";

import { useMemo, useState } from "react";
import { useCourses, useCreateCourse } from "@/hooks/useCourses";
import { usePeople } from "@/hooks/usePeople";
import { CourseList } from "@/components/courses/CourseList";
import { CourseForm } from "@/components/courses/CourseForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import {
  PersonFilterToggle,
  defaultPersonFilterSelection,
  type PersonFilterSelection,
} from "@/components/calendar/PersonFilterToggle";
import { PersonLegend } from "@/components/calendar/PersonLegend";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_OWNER_COLOR } from "@/lib/owner-color";
import type { CoursePayload } from "@/lib/api/schemas";
import type { CourseRow } from "@/lib/api/entity-types";

export function CourseListContainer() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  // null = untouched, falls back to Mine only — matches
  // WeekGridContainer's default so switching between Calendar and Courses
  // doesn't reset expectations. Each person can be toggled independently.
  const [personFilter, setPersonFilter] = useState<PersonFilterSelection | null>(null);
  // Hidden by default — a finished course (recurrence_end_date before today)
  // is clutter on the roster until the switch brings it back.
  const [showPast, setShowPast] = useState(false);
  const { data, isLoading } = useCourses();
  const { data: people, isLoading: peopleLoading } = usePeople();
  const { data: settings } = useSettings();
  const createCourse = useCreateCourse();
  const { showToast } = useToast();

  const selection = personFilter ?? defaultPersonFilterSelection();
  const matchesFilter = (personId: string | null) => selection.has(personId ?? "me");

  // Falls back to the default accent so "Mine" always has a swatch that
  // matches the owner's course cards, even before a color is chosen.
  const ownerColor = settings?.owner_color ?? DEFAULT_OWNER_COLOR;
  const showMineLegend = selection.has("me");
  const visibleLegendPeople = (people?.rows ?? []).some((person) => selection.has(person.id));

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isPastCourse = (course: CourseRow) => !!course.recurrence_end_date && course.recurrence_end_date < todayDate;

  const courses = (data?.rows ?? []).filter(
    (course) => matchesFilter(course.person_id) && (showPast || !isPastCourse(course)),
  );

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
          <Switch checked={showPast} onCheckedChange={setShowPast} label="Show past courses" />
          {(people?.rows.length ?? 0) > 0 && (
            <PersonFilterToggle people={people?.rows ?? []} value={selection} onChange={setPersonFilter} label="courses" />
          )}
          <Button onClick={() => setCreateOpen(true)}>New course</Button>
        </div>
      </div>

      {(showMineLegend || visibleLegendPeople) && (
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-text-secondary">
          {showMineLegend && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: ownerColor }} />
              Mine
            </span>
          )}
          <PersonLegend people={people?.rows ?? []} selection={selection} />
        </div>
      )}

      {isLoading || peopleLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <CourseList courses={courses} people={people?.rows ?? []} ownerColor={ownerColor} />
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="New course" size="xl">
        <CourseForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Create course" />
      </Dialog>
    </div>
  );
}
