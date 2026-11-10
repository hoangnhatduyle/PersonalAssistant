"use client";

import { createContext, memo, useContext, useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Gantt, WillowDark, type IApi, type ITask } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/style.css";
import "./gantt-theme.css";
import { describeGanttRow, type GanttRow, type GanttUnit } from "@/lib/dashboard/gantt-rows";
import { CELL_HEIGHT, SCALE_HEIGHT } from "@/components/dashboard/gantt/gantt-metrics";
import { GanttRowLabels } from "@/components/dashboard/gantt/GanttRowLabels";
import { fitCellWidth, labelColumnWidth } from "@/components/dashboard/gantt/cell-width";
import { useElementWidth } from "@/hooks/useElementWidth";

type Props = {
  rows: GanttRow[];
  /** First and last instant of the visible range. */
  rangeStart: Date;
  rangeEnd: Date;
  unit: GanttUnit;
  /** Today is shaded. Pass a value that only changes about once a minute, so the chart is not redrawn every tick. */
  now: Date;
  /** Called with a row's id when its bar (or its title) is clicked, or its bar is activated from the keyboard. */
  onOpenRow: (rowId: string) => void;
};

const SCALES: Record<GanttUnit, Array<{ unit: "month" | "week" | "day"; step: number; format: string }>> = {
  day: [
    { unit: "month", step: 1, format: "%M %Y" },
    { unit: "day", step: 1, format: "%j" },
  ],
  week: [
    { unit: "month", step: 1, format: "%M %Y" },
    { unit: "week", step: 1, format: "%j" },
  ],
};

// Chart only: below 650px the library collapses to a single panel, which is where this card sits on most
// screens, so the title column is drawn by this component (GanttRowLabels) instead of the library's grid.
const CHART_ONLY = ["chart" as const];

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface BarContextValue {
  rowsById: Map<string, GanttRow>;
  open: (rowId: string) => void;
}

const BarContext = createContext<BarContextValue>({ rowsById: new Map(), open: () => undefined });

/**
 * One bar's contents: the library supplies position and size, this supplies the look (kind colour,
 * progress fill, label), a tooltip, and keyboard access (the library's own bars are not focusable).
 */
function Bar({ data }: { data: ITask }) {
  const { rowsById, open } = useContext(BarContext);
  const id = String(data.id);
  const row = rowsById.get(id);
  if (!row) return null;

  const summary = describeGanttRow(row);
  const fill = Math.min(100, Math.max(0, row.percent ?? 0));
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open(id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={summary}
      title={summary}
      onKeyDown={handleKeyDown}
      className={`cadence-bar cadence-bar--${row.kind}${row.overdue ? " cadence-bar--overdue" : ""}${row.clippedStart ? " cadence-bar--clipped" : ""}`}
    >
      <div className="cadence-bar__fill" style={{ width: `${fill}%` }} />
      <span className="cadence-bar__label">{row.percent != null ? `${row.percent}%` : ""}</span>
    </div>
  );
}

/**
 * The Gantt itself: a read-only SVAR chart styled to the dashboard. Rows arrive already resolved
 * (see buildGanttModel), so this component only draws and reports clicks. Vertical markers are a
 * PRO feature of the library, so "today" is a shaded column instead.
 */
export const GanttChart = memo(function GanttChart({ rows, rangeStart, rangeEnd, unit, now, onOpenRow }: Props) {
  // The library calls `init` once, so it must reach the latest handler through a ref rather than a closure.
  const onOpenRef = useRef(onOpenRow);
  useEffect(() => {
    onOpenRef.current = onOpenRow;
  }, [onOpenRow]);

  const outerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const labelWidth = labelColumnWidth(useElementWidth(outerRef));
  const paneWidth = useElementWidth(paneRef);
  const cellWidth = fitCellWidth(unit, rangeStart, rangeEnd, paneWidth);

  const tasks = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        text: row.title,
        start: row.start,
        end: row.end,
        type: "task" as const,
        progress: row.percent ?? 0,
      })),
    [rows],
  );

  const barContext = useMemo<BarContextValue>(
    () => ({ rowsById: new Map(rows.map((row) => [row.id, row])), open: (rowId) => onOpenRef.current(rowId) }),
    [rows],
  );

  const highlightTime = useMemo(
    () => (date: Date, cellUnit: "day" | "hour") => (cellUnit === "day" && isSameDay(date, now) ? "cadence-gantt-today" : ""),
    [now],
  );

  const init = useMemo(
    () => (api: IApi) => {
      // Opening the item's own dialog replaces the library's built-in editor, which must never open.
      api.intercept("show-editor", () => false);
      api.on("select-task", (event: { id: string | number }) => onOpenRef.current(String(event.id)));
    },
    [],
  );

  return (
    <BarContext.Provider value={barContext}>
      <div ref={outerRef} className="flex h-full w-full">
        <GanttRowLabels rows={rows} onOpenRow={onOpenRow} widthPx={labelWidth} />
      <div ref={paneRef} className="cadence-gantt min-w-[120px] flex-1" data-unit={unit}>
        <WillowDark fonts={false}>
          <Gantt
            tasks={tasks}
            links={[]}
            readonly
            columns={false}
            displayMode={CHART_ONLY}
            scales={SCALES[unit]}
            start={rangeStart}
            end={rangeEnd}
            autoScale={false}
            cellWidth={cellWidth}
            cellHeight={CELL_HEIGHT}
            scaleHeight={SCALE_HEIGHT}
            taskTemplate={Bar}
            highlightTime={highlightTime}
            init={init}
          />
        </WillowDark>
      </div>
      </div>
    </BarContext.Provider>
  );
});
