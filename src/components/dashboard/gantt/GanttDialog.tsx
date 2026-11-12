"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { UpNextGanttView, type GanttOpenTarget } from "@/components/dashboard/gantt/UpNextGanttView";
import { buildUpcomingItems, filterUpcomingItemsByTimeWindow, type TimeWindowFilter } from "@/lib/dashboard/upcoming-items";
import type { AppointmentRow, CourseRow, DeadlineRow, PersonRow, TaskRow } from "@/lib/api/entity-types";

const RANGES: Array<{ value: TimeWindowFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3days", label: "3 Days" },
  { value: "7days", label: "7 Days" },
  { value: "all", label: "All" },
];
const DEFAULT_RANGE: TimeWindowFilter = "7days";

type Props = {
  open: boolean;
  onClose: () => void;
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
  people: PersonRow[];
  courses: CourseRow[];
  /** Only needs to change about once a minute (it decides which column is "today"). */
  now: Date;
  onOpen: (target: GanttOpenTarget) => void;
};

/** The Gantt chart in its own large dialog, with its own range (the Up Next card's filter keeps driving only the list). */
export function GanttDialog({ open, onClose, deadlines, tasks, appointments, people, courses, now, onOpen }: Props) {
  const [range, setRange] = useState<TimeWindowFilter>(DEFAULT_RANGE);

  const items = useMemo(
    () => (open ? filterUpcomingItemsByTimeWindow(buildUpcomingItems({ deadlines, tasks, appointments, people, courses }), range, now) : []),
    [open, range, now, deadlines, tasks, appointments, people, courses],
  );

  return (
    <Dialog open={open} onClose={onClose} title="Gantt" size="full">
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Gantt range" className="flex flex-wrap items-center gap-2">
          {RANGES.map((option) => {
            const isActive = range === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setRange(option.value)}
                className={`rounded-full px-2.5 py-1 font-mono text-xs uppercase tracking-wide transition-colors ${
                  isActive ? "bg-accent-indigo text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <UpNextGanttView items={items} deadlines={deadlines} tasks={tasks} appointments={appointments} window={range} now={now} onOpen={onOpen} />
      </div>
    </Dialog>
  );
}
