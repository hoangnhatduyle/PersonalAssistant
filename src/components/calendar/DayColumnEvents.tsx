"use client";

import { useState } from "react";
import { EventBlock } from "@/components/calendar/EventBlock";
import { OverlapEventPicker } from "@/components/calendar/OverlapEventPicker";
import { EmptySlotCreatePicker, type CreateEntityType } from "@/components/calendar/EmptySlotCreatePicker";
import { pxToMinutes, PIXELS_PER_MINUTE, type LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";

export type CreateRequest = { type: CreateEntityType; date: string; minutes: number };

type Props = {
  isToday: boolean;
  date: string;
  events: LayoutedCalendarEvent[];
  hourMarks: number[];
  windowStart: number;
  gridHeightPx: number;
  onCreateRequest: (request: CreateRequest) => void;
};

type OpenPicker = {
  clusterId: string;
  anchorRect: DOMRect;
};

type OpenCreatePicker = {
  anchorRect: DOMRect;
  minutes: number;
};

export function DayColumnEvents({ isToday, date, events, hourMarks, windowStart, gridHeightPx, onCreateRequest }: Props) {
  const [elevatedEventId, setElevatedEventId] = useState<string | null>(null);
  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const [createPicker, setCreatePicker] = useState<OpenCreatePicker | null>(null);

  const pickerEvents = picker
    ? events.filter((event) => event.clusterId === picker.clusterId).sort((a, b) => a.stackIndex - b.stackIndex)
    : [];

  return (
    <div
      className={`relative overflow-visible border-l ${isToday ? "bg-panel/40" : ""} border-panel-border`}
      style={{ height: gridHeightPx }}
      onMouseLeave={() => setElevatedEventId(null)}
      onClick={(event) => {
        // Only a genuine background click (not one bubbling up from an
        // EventBlock or a pointer-events-none hour-row marker) should open
        // the create picker — this keeps it mutually exclusive with the
        // overlap picker above without needing changes to EventBlock.
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const minutes = pxToMinutes(event.clientY - rect.top, windowStart);
        setCreatePicker({ anchorRect: new DOMRect(event.clientX, event.clientY, 0, 0), minutes });
      }}
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
          onOpenPicker={(anchorRect) => setPicker({ clusterId: event.clusterId, anchorRect })}
        />
      ))}
      {picker && pickerEvents.length > 0 && (
        <OverlapEventPicker
          events={pickerEvents}
          anchorRect={picker.anchorRect}
          onClose={() => setPicker(null)}
        />
      )}
      {createPicker && (
        <EmptySlotCreatePicker
          anchorRect={createPicker.anchorRect}
          onSelect={(type) => {
            onCreateRequest({ type, date, minutes: createPicker.minutes });
            setCreatePicker(null);
          }}
          onClose={() => setCreatePicker(null)}
        />
      )}
    </div>
  );
}
