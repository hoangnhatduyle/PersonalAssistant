"use client";

import { useState } from "react";
import { EventBlock } from "@/components/calendar/EventBlock";
import { layoutDayEvents, PIXELS_PER_MINUTE, type LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";

type Props = {
  isToday: boolean;
  events: LayoutedCalendarEvent[];
  hourMarks: number[];
  windowStart: number;
  gridHeightPx: number;
};

export function DayColumnEvents({ isToday, events, hourMarks, windowStart, gridHeightPx }: Props) {
  const [elevatedEventId, setElevatedEventId] = useState<string | null>(null);

  const cycleCluster = (clusterId: string) => {
    const cluster = events.filter((event) => event.clusterId === clusterId).sort((a, b) => a.stackIndex - b.stackIndex);
    if (cluster.length <= 1) return;

    const currentIndex = cluster.findIndex((event) => event.id === elevatedEventId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % cluster.length;
    setElevatedEventId(cluster[nextIndex].id);
  };

  return (
    <div
      className={`relative overflow-visible border-l ${isToday ? "bg-panel/40" : ""} border-panel-border`}
      style={{ height: gridHeightPx }}
      onMouseLeave={() => setElevatedEventId(null)}
    >
      {hourMarks.map((minute) => (
        <div
          key={minute}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-panel-border/50"
          style={{ top: (minute - windowStart) * PIXELS_PER_MINUTE }}
        />
      ))}
      {events.map((event) => (
        <EventBlock
          key={event.id}
          title={event.title}
          timeLabel={event.timeLabel}
          subtitle={event.subtitle}
          topPx={event.topPx}
          heightPx={event.heightPx}
          leftPx={event.leftPx}
          widthPx={event.widthPx}
          stackIndex={event.stackIndex}
          stackSize={event.stackSize}
          isElevated={elevatedEventId === event.id}
          tone={event.tone}
          href={event.href}
          color={event.color}
          onElevate={() => setElevatedEventId(event.id)}
          onCycleCluster={() => cycleCluster(event.clusterId)}
        />
      ))}
    </div>
  );
}
