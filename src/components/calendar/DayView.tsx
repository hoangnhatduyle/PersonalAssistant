"use client";

import { useEffect, useRef, useState } from "react";
import { DayColumnEvents } from "@/components/calendar/DayColumnEvents";
import { formatMinutesOfDay } from "@/lib/calendar/recurrence";
import { layoutDayEvents, PIXELS_PER_MINUTE, weekGridHeightPx } from "@/lib/calendar/layout-day-events";
import type { DayColumn } from "@/lib/calendar/build-week-events";
import { Button } from "@/components/ui/Button";

type Props = {
  day: DayColumn;
  hourMarks: number[];
  windowStart: number;
  windowEnd: number;
  onPrevDay: () => void;
  onNextDay: () => void;
};

const TIME_AXIS_WIDTH_PX = 64;

/** Single-day mobile view of the week grid — same event layout primitives as WeekGrid, one full-width column. */
export function DayView({ day, hourMarks, windowStart, windowEnd, onPrevDay, onNextDay }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnWidthPx, setColumnWidthPx] = useState(0);
  const gridHeightPx = weekGridHeightPx(windowStart, windowEnd);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => setColumnWidthPx(Math.max(grid.clientWidth - TIME_AXIS_WIDTH_PX, 0));

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="max-h-[75vh] overflow-auto">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={onPrevDay}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
        <p className={`font-mono text-sm uppercase tracking-wide ${day.isToday ? "text-accent-teal" : "text-text-primary"}`}>
          {day.label}
        </p>
        <Button variant="secondary" size="icon" aria-label="Next day" onClick={onNextDay}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      </div>

      <div ref={gridRef} className="grid grid-cols-[64px_1fr]">
        <div className="relative" style={{ height: gridHeightPx }}>
          {hourMarks.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-text-secondary"
              style={{ top: (minute - windowStart) * PIXELS_PER_MINUTE }}
            >
              {formatMinutesOfDay(minute)}
            </span>
          ))}
        </div>

        <DayColumnEvents
          isToday={day.isToday}
          events={layoutDayEvents(day.events, windowStart, columnWidthPx)}
          hourMarks={hourMarks}
          windowStart={windowStart}
          gridHeightPx={gridHeightPx}
        />
      </div>
    </div>
  );
}
