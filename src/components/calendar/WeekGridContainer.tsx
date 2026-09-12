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
import { Button } from "@/components/ui/Button";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Sunday-start week bounds for `referenceDate` — mirrors build-week-events.ts's own startOfWeek. */
function weekRangeFor(referenceDate: Date): { start: Date; end: Date } {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function WeekGridContainer() {
  // Whole-week offset from the current week (0 = this week, -1 = last week, 1 = next week).
  const [weekOffset, setWeekOffset] = useState(0);
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
  const today = new Date();
  const referenceDate = new Date(today.getTime() + weekOffset * WEEK_MS);

  const weekGrid = isLoading
    ? null
    : buildWeekGridData(
        (courses?.rows ?? []).filter((course) => matchesFilter(course.person_id)),
        deadlines?.rows ?? [],
        (tasks?.rows ?? []).filter((task) => matchesFilter(task.person_id)),
        people?.rows ?? [],
        referenceDate,
        matchesFilter(null) ? (appointments?.rows ?? []) : [],
        today,
      );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Chronos</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-text-primary">
              {weekOffset === 0 ? "This week" : formatWeekRange(weekRangeFor(referenceDate).start, weekRangeFor(referenceDate).end)}
            </h1>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Previous week"
                onClick={() => setWeekOffset((offset) => offset - 1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
              >
                Today
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Next week"
                onClick={() => setWeekOffset((offset) => offset + 1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </div>
          </div>
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
