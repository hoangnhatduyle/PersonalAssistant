"use client";

import { useState } from "react";
import { useCourses } from "@/hooks/useCourses";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { useAppointments } from "@/hooks/useAppointments";
import { buildWeekGridData } from "@/lib/calendar/build-week-events";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { AppointmentsTimeline } from "@/components/calendar/AppointmentsTimeline";
import {
  PersonFilterToggle,
  defaultPersonFilterSelection,
  type PersonFilterSelection,
} from "@/components/calendar/PersonFilterToggle";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/Skeleton";

export function WeekGridContainer() {
  const { data: courses, isLoading: coursesLoading } = useCourses();
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: people, isLoading: peopleLoading } = usePeople();
  // Same filters object as AppointmentsTimeline's own fetch below, so
  // TanStack Query dedupes this into the one request/cache entry.
  const { data: appointments, isLoading: appointmentsLoading } = useAppointments({ limit: 100 });
  // null = untouched, falls back to everyone overlaid (matches this
  // component's pre-People behavior of showing every fetched row
  // unfiltered, and the ride-planning use case this feature exists for).
  // Once the user interacts, personFilter holds their exact selection —
  // including an intentionally empty set — so each person can be toggled
  // independently (e.g. Mine + Châu at the same time).
  const [personFilter, setPersonFilter] = useState<PersonFilterSelection | null>(null);

  const isLoading = coursesLoading || deadlinesLoading || tasksLoading || peopleLoading || appointmentsLoading;
  const selection = personFilter ?? defaultPersonFilterSelection(people?.rows ?? []);

  const matchesFilter = (personId: string | null) => selection.has(personId ?? "me");

  // Appointments have no person_id — the People feature doesn't apply to
  // them — so they're gated on the "me" bucket as a whole rather than
  // per-row like courses/tasks. Deadlines are passed through unfiltered by
  // the toggle — buildWeekGridData itself unconditionally excludes a
  // tracked person's Deadline (see its own comment), so toggling a person
  // on/off here never affects whether their Deadlines show — they never do.
  const weekGrid = isLoading
    ? null
    : buildWeekGridData(
        (courses?.rows ?? []).filter((course) => matchesFilter(course.person_id)),
        deadlines?.rows ?? [],
        (tasks?.rows ?? []).filter((task) => matchesFilter(task.person_id)),
        people?.rows ?? [],
        undefined,
        matchesFilter(null) ? (appointments?.rows ?? []) : [],
      );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Chronos</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">This week</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CalendarLegend people={people?.rows ?? []} />
          {(people?.rows.length ?? 0) > 0 && (
            <PersonFilterToggle people={people?.rows ?? []} value={selection} onChange={setPersonFilter} />
          )}
        </div>
      </div>

      {!weekGrid ? (
        <Skeleton className="h-[75vh] min-h-96 w-full" />
      ) : (
        <GlassPanel className="p-4">
          <WeekGrid days={weekGrid.days} hourMarks={weekGrid.hourMarks} windowStart={weekGrid.windowStart} windowEnd={weekGrid.windowEnd} />
        </GlassPanel>
      )}

      <AppointmentsTimeline />
    </div>
  );
}
