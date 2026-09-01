"use client";

import { useEffect, useRef, useState } from "react";
import { EventBlock } from "@/components/calendar/EventBlock";
import { formatMinutesOfDay } from "@/lib/calendar/recurrence";
import { layoutDayEvents, PIXELS_PER_MINUTE, weekGridHeightPx } from "@/lib/calendar/layout-day-events";
import type { DayColumn } from "@/lib/calendar/build-week-events";

type Props = {
  days: DayColumn[];
  hourMarks: number[];
  windowStart: number;
  windowEnd: number;
};

const TIME_AXIS_WIDTH_PX = 64;
const MIN_DAY_COLUMN_WIDTH_PX = 110;

export function WeekGrid({ days, hourMarks, windowStart, windowEnd }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dayColumnWidthPx, setDayColumnWidthPx] = useState(MIN_DAY_COLUMN_WIDTH_PX);
  const gridHeightPx = weekGridHeightPx(windowStart, windowEnd, days, dayColumnWidthPx);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const width = grid.clientWidth - TIME_AXIS_WIDTH_PX;
      setDayColumnWidthPx(Math.max(width / 7, MIN_DAY_COLUMN_WIDTH_PX));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="max-h-[75vh] overflow-auto">
      <div ref={gridRef} className="grid min-w-[860px] grid-cols-[64px_repeat(7,1fr)]">
        <div />
        {days.map((day) => (
          <div
            key={day.key}
            className={`border-b px-2 pb-2 text-center ${day.isToday ? "border-accent-teal" : "border-panel-border"}`}
          >
            <p className={`font-mono text-xs uppercase tracking-wide ${day.isToday ? "text-accent-teal" : "text-text-eyebrow"}`}>
              {day.label}
            </p>
          </div>
        ))}

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

        {days.map((day) => {
          const layoutedEvents = layoutDayEvents(day.events, windowStart, dayColumnWidthPx);

          return (
            <div
              key={day.key}
              className={`relative border-l ${day.isToday ? "bg-panel/40" : ""} border-panel-border`}
              style={{ height: gridHeightPx }}
            >
              {hourMarks.map((minute) => (
                <div
                  key={minute}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-panel-border/50"
                  style={{ top: (minute - windowStart) * PIXELS_PER_MINUTE }}
                />
              ))}
              {layoutedEvents.map((event) => (
                <EventBlock
                  key={event.id}
                  title={event.title}
                  timeLabel={event.timeLabel}
                  subtitle={event.subtitle}
                  topPx={event.topPx}
                  heightPx={event.heightPx}
                  leftPx={event.leftPx}
                  widthPx={event.widthPx}
                  tone={event.tone}
                  href={event.href}
                  color={event.color}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
