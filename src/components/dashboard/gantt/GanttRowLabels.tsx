"use client";

import { describeGanttRow, type GanttRow } from "@/lib/dashboard/gantt-rows";
import { CELL_HEIGHT, SCALE_HEIGHT, SCALE_ROWS } from "@/components/dashboard/gantt/gantt-metrics";

type Props = {
  rows: GanttRow[];
  onOpenRow: (rowId: string) => void;
  /** Column width in px. Chosen by the chart from the card's real width, since a viewport breakpoint cannot know how wide this card's column is. */
  widthPx: number;
};

/**
 * The title column to the left of the bars: one fixed-height button per row, lined up with the chart's rows by
 * sharing its row height and starting below its two-row scale header. Clicking one opens the same dialog as its bar.
 */
export function GanttRowLabels({ rows, onOpenRow, widthPx }: Props) {
  return (
    <ul className="cadence-gantt-labels m-0 shrink-0 list-none p-0" style={{ width: widthPx, paddingTop: SCALE_HEIGHT * SCALE_ROWS }}>
      {rows.map((row) => (
        <li key={row.id} style={{ height: CELL_HEIGHT }} className="flex items-center">
          <button
            type="button"
            title={describeGanttRow(row)}
            onClick={() => onOpenRow(row.id)}
            className={`cadence-gantt-label cadence-gantt-label--${row.kind}${row.overdue ? " cadence-gantt-label--overdue" : ""}`}
          >
            <span aria-hidden="true" className="cadence-gantt-label__dot" />
            <span className="truncate">{row.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
