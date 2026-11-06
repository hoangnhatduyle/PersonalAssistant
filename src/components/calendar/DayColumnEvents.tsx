"use client";

import { useState } from "react";
import { CalendarEventItem } from "@/components/calendar/CalendarEventItem";
import { OverlapEventPicker } from "@/components/calendar/OverlapEventPicker";
import { EmptySlotCreatePicker, type CreateEntityType } from "@/components/calendar/EmptySlotCreatePicker";
import { useCurrentMinuteOfDay } from "@/hooks/useCurrentMinuteOfDay";
import { formatMinutesOfDay } from "@/lib/calendar/recurrence";
import { pxToMinutes, PIXELS_PER_MINUTE, type LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";
import type { EventTimes } from "@/lib/calendar/drag-math";

export type CreateRequest = { type: CreateEntityType; date: string; minutes: number };

type Props = {
  isToday: boolean;
  date: string;
  events: LayoutedCalendarEvent[];
  hourMarks: number[];
  windowStart: number;
  gridHeightPx: number;
  onCreateRequest: (request: CreateRequest) => void;
  /** A drag or resize ended: this block now sits at `times`. Omitted = blocks are display-only. */
  onEditEvent?: (event: CalendarEvent, times: EventTimes) => void;
  /** Open the Adjust time form for a block. */
  onAdjustTime?: (event: CalendarEvent) => void;
};

type OpenPicker = {
  clusterId: string;
  anchorRect: DOMRect;
};

type OpenCreatePicker = {
  anchorRect: DOMRect;
  minutes: number;
};

export function DayColumnEvents({ isToday, date, events, hourMarks, windowStart, gridHeightPx, onCreateRequest, onEditEvent, onAdjustTime }: Props) {
  const [elevatedEventId, setElevatedEventId] = useState<string | null>(null);
  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const [createPicker, setCreatePicker] = useState<OpenCreatePicker | null>(null);
  // Minutes-of-day under the pointer while hovering empty space — drives the
  // "start time" preview line so the user knows what a click there will
  // create before they commit to it.
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);

  const currentMinutes = useCurrentMinuteOfDay();
  const nowTopPx = currentMinutes === null ? null : (currentMinutes - windowStart) * PIXELS_PER_MINUTE;
  const showNowLine = isToday && nowTopPx !== null && nowTopPx >= 0 && nowTopPx <= gridHeightPx;

  const pickerEvents = picker
    ? events.filter((event) => event.clusterId === picker.clusterId).sort((a, b) => a.stackIndex - b.stackIndex)
    : [];

  return (
    <div
      data-testid="day-column"
      data-date={date}
      className={`relative overflow-visible border-l ${isToday ? "bg-panel/40" : ""} border-panel-border cursor-pointer`}
      style={{ height: gridHeightPx }}
      onMouseLeave={() => {
        setElevatedEventId(null);
        setHoverMinutes(null);
      }}
      onMouseMove={(event) => {
        // Same background-only gate as the click handler below — hovering an
        // EventBlock (or its stack-count badge) hides the preview instead of
        // showing a start time for a slot the click wouldn't actually use.
        // A held mouse button means a block is being dragged across this column (see
        // useEventDrag), not that the user is hovering to pick a slot to create in.
        if (event.target !== event.currentTarget || event.buttons !== 0) {
          setHoverMinutes(null);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setHoverMinutes(pxToMinutes(event.clientY - rect.top, windowStart));
      }}
      onClick={(event) => {
        // Only a genuine background click (not one bubbling up from an
        // EventBlock or a pointer-events-none hour-row marker) should open
        // the create picker — this keeps it mutually exclusive with the
        // overlap picker above without needing changes to EventBlock.
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const minutes = pxToMinutes(event.clientY - rect.top, windowStart);
        setHoverMinutes(null);
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
      {hoverMinutes !== null && !createPicker && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-dashed border-accent-indigo"
          style={{ top: (hoverMinutes - windowStart) * PIXELS_PER_MINUTE }}
        >
          <span className="absolute left-1 -translate-y-1/2 whitespace-nowrap rounded-full bg-accent-indigo px-1.5 py-0.5 font-mono text-[9px] font-medium text-white shadow-sm">
            {formatMinutesOfDay(hoverMinutes)}
          </span>
        </div>
      )}
      {showNowLine && (
        <div
          data-testid="current-time-line"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-dotted border-status-urgent"
          style={{ top: nowTopPx }}
        >
          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-status-urgent" />
        </div>
      )}
      {events.map((event) => (
        <CalendarEventItem
          key={event.id}
          event={event}
          windowStart={windowStart}
          isElevated={elevatedEventId === event.id}
          onElevate={() => setElevatedEventId(event.id)}
          onOpenPicker={(anchorRect) => setPicker({ clusterId: event.clusterId, anchorRect })}
          onEditEvent={onEditEvent}
          onAdjustTime={onAdjustTime}
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
