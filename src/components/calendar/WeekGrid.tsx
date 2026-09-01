import { EventBlock } from "@/components/calendar/EventBlock";
import { formatMinutesOfDay } from "@/lib/calendar/parse-meeting-pattern";
import type { DayColumn } from "@/lib/calendar/build-week-events";

type Props = {
  days: DayColumn[];
  hourMarks: number[];
  windowStart: number;
  windowEnd: number;
};

const GRID_HEIGHT_PX = 640;

export function WeekGrid({ days, hourMarks, windowStart, windowEnd }: Props) {
  const span = windowEnd - windowStart;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[860px] grid-cols-[64px_repeat(7,1fr)]">
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

        <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
          {hourMarks.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-text-secondary"
              style={{ top: `${((minute - windowStart) / span) * 100}%` }}
            >
              {formatMinutesOfDay(minute)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div
            key={day.key}
            className={`relative border-l ${day.isToday ? "bg-panel/40" : ""} border-panel-border`}
            style={{ height: GRID_HEIGHT_PX }}
          >
            {hourMarks.map((minute) => (
              <div
                key={minute}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-panel-border/50"
                style={{ top: `${((minute - windowStart) / span) * 100}%` }}
              />
            ))}
            {day.events.map((event) => (
              <EventBlock
                key={event.id}
                title={event.title}
                subtitle={event.subtitle}
                top={event.top}
                height={event.height}
                tone={event.tone}
                href={event.href}
                color={event.color}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
