"use client";

import { EventBlock } from "@/components/calendar/EventBlock";
import { EventEditControls } from "@/components/calendar/EventEditControls";
import { DragPreviewBox } from "@/components/calendar/DragPreviewBox";
import { useEventDrag } from "@/hooks/useEventDrag";
import type { CalendarEvent } from "@/lib/calendar/build-week-events";
import type { EventTimes } from "@/lib/calendar/drag-math";
import type { LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";

type Props = {
  event: LayoutedCalendarEvent;
  windowStart: number;
  isElevated: boolean;
  onElevate: () => void;
  onOpenPicker: (anchorRect: DOMRect) => void;
  /** Called with the block's new date/time after a drag or resize. Omitted = the block is display-only. */
  onEditEvent?: (event: CalendarEvent, times: EventTimes) => void;
  /** Opens the Adjust time form for this block. */
  onAdjustTime?: (event: CalendarEvent) => void;
};

/**
 * One block on the week grid: its EventBlock plus, when it is editable, the
 * drag-to-move/resize behaviour, the resize handle, the Adjust time button
 * and the drop preview. Each block owns its own drag session (useEventDrag).
 */
export function CalendarEventItem({ event, windowStart, isElevated, onElevate, onOpenPicker, onEditEvent, onAdjustTime }: Props) {
  const isPoint = event.kind === "deadline" || event.kind === "task";
  const isEditable = event.editable && Boolean(onEditEvent);

  const { drag, startMove, startResize } = useEventDrag({
    original: { date: event.occurrenceDate, startMinutes: event.startMinutes, endMinutes: event.endMinutes },
    isPoint,
    enabled: isEditable,
    onCommit: (times) => onEditEvent?.(event, times),
  });

  return (
    <>
      <EventBlock
        eventId={event.id}
        title={event.title}
        timeLabel={event.timeLabel}
        subtitle={event.subtitle}
        topPx={event.topPx}
        heightPx={event.heightPx}
        visibleHeightPx={event.visibleHeightPx}
        leftPx={event.leftPx}
        widthPx={event.widthPx}
        stackIndex={event.stackIndex}
        stackSize={event.stackSize}
        isElevated={isElevated}
        tone={event.tone}
        href={event.href}
        color={event.color}
        isEditable={isEditable}
        isDragging={drag?.mode === "move"}
        onPointerDown={startMove}
        onElevate={onElevate}
        onOpenPicker={onOpenPicker}
      />
      {isEditable && (
        <EventEditControls
          event={event}
          isElevated={isElevated}
          canResize={!isPoint}
          onResizeStart={startResize}
          onAdjustTime={() => onAdjustTime?.(event)}
        />
      )}
      {drag && <DragPreviewBox title={event.title} drag={drag} windowStart={windowStart} isPoint={isPoint} />}
    </>
  );
}
