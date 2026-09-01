"use client";

import { useState } from "react";
import { useCourses } from "@/hooks/useCourses";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTasks } from "@/hooks/useTasks";
import { usePeople } from "@/hooks/usePeople";
import { buildWeekGridData } from "@/lib/calendar/build-week-events";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";
import { PersonFilterToggle, type PersonFilterValue } from "@/components/calendar/PersonFilterToggle";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

export function WeekGridContainer() {
  const { data: courses, isLoading: coursesLoading } = useCourses();
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: people, isLoading: peopleLoading } = usePeople();
  // Defaults to "all" (overlaid) — matches this component's pre-People
  // behavior of showing every fetched row unfiltered, and the ride-planning
  // use case this feature exists for (seeing both schedules at once).
  const [personFilter, setPersonFilter] = useState<PersonFilterValue>("all");

  const isLoading = coursesLoading || deadlinesLoading || tasksLoading || peopleLoading;

  const matchesFilter = (personId: string | null) => {
    if (personFilter === "all") return true;
    if (personFilter === "me") return personId === null;
    return personId === personFilter;
  };

  const weekGrid = isLoading
    ? null
    : buildWeekGridData(
        (courses?.rows ?? []).filter((course) => matchesFilter(course.person_id)),
        (deadlines?.rows ?? []).filter((deadline) => matchesFilter(deadline.person_id)),
        (tasks?.rows ?? []).filter((task) => matchesFilter(task.person_id)),
        people?.rows ?? [],
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
            <PersonFilterToggle people={people?.rows ?? []} value={personFilter} onChange={setPersonFilter} />
          )}
        </div>
      </div>

      {!weekGrid ? (
        <Skeleton className="h-[640px] w-full" />
      ) : (
        <>
          <GlassPanel className="p-4">
            <WeekGrid days={weekGrid.days} hourMarks={weekGrid.hourMarks} windowStart={weekGrid.windowStart} windowEnd={weekGrid.windowEnd} />
          </GlassPanel>

          {weekGrid.unparsedCourses.length > 0 && (
            <GlassPanel className="flex flex-col gap-2 p-4">
              <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Couldn&apos;t place on the grid</p>
              <div className="flex flex-wrap gap-2">
                {weekGrid.unparsedCourses.map((course) => (
                  <Badge key={course.id} tone="neutral">
                    {course.name}: {course.meeting_pattern}
                  </Badge>
                ))}
              </div>
            </GlassPanel>
          )}
        </>
      )}
    </div>
  );
}
