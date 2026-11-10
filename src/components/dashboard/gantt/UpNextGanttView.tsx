"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import { useChecklistSummary } from "@/hooks/useChecklistItems";
import { buildGanttModel, type GanttRowKind } from "@/lib/dashboard/gantt-rows";
import { ganttHeightPx } from "@/components/dashboard/gantt/gantt-metrics";
import type { TimeWindowFilter, UpcomingItem } from "@/lib/dashboard/upcoming-items";
import type { AppointmentRow, DeadlineRow, TaskRow } from "@/lib/api/entity-types";

// The chart library draws a canvas background on the client, so it must never render on the server
// (it also keeps the library out of the dashboard's first-load bundle until Gantt is chosen).
const GanttChart = dynamic(() => import("@/components/dashboard/gantt/GanttChart").then((module) => module.GanttChart), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full" />,
});

export interface GanttOpenTarget {
  kind: GanttRowKind;
  id: string;
}

type Props = {
  /** Up Next's already time-window-filtered items. */
  items: UpcomingItem[];
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  appointments: AppointmentRow[];
  window: TimeWindowFilter;
  /** Only needs to change about once a minute (it decides which column is "today"). */
  now: Date;
  onOpen: (target: GanttOpenTarget) => void;
};

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "Deadline", swatch: "cadence-legend-swatch--deadline" },
  { label: "Task", swatch: "cadence-legend-swatch--task" },
  { label: "Session", swatch: "cadence-legend-swatch--session" },
  { label: "Overdue", swatch: "cadence-legend-swatch--overdue" },
];

/** The Gantt face of the Up Next card: the same filtered items as the list, drawn as bars filled by progress. */
export function UpNextGanttView({ items, deadlines, tasks, appointments, window, now, onOpen }: Props) {
  const { data: checklist } = useChecklistSummary();

  const model = useMemo(
    () => buildGanttModel({ items, deadlines, tasks, appointments, checklist: checklist ?? [], window, now }),
    [items, deadlines, tasks, appointments, checklist, window, now],
  );

  const rowsById = useMemo(() => new Map(model.rows.map((row) => [row.id, row])), [model.rows]);
  const handleOpenRow = (rowId: string) => {
    const row = rowsById.get(rowId);
    if (row) onOpen({ kind: row.kind, id: row.entityId });
  };

  if (model.rows.length === 0) {
    return <p className="py-6 text-center text-sm text-text-secondary">Nothing to chart here. Only deadlines, tasks and sessions get bars; events are in the list.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The chart is drawn at full height and this box scrolls, so the title column and the bars stay in step. */}
      <div className="max-h-[22rem] overflow-y-auto overflow-x-hidden">
        <div style={{ height: ganttHeightPx(model.rows.length) }}>
          <GanttChart rows={model.rows} rangeStart={model.rangeStart} rangeEnd={model.rangeEnd} unit={model.unit} now={now} onOpenRow={handleOpenRow} />
        </div>
      </div>
      <ul aria-label="Chart legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">
        {LEGEND.map(({ label, swatch }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`cadence-legend-swatch ${swatch}`} />
            {label}
          </li>
        ))}
        <li>Fill = progress</li>
      </ul>
    </div>
  );
}
