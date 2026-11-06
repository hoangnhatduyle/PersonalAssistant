"use client";

import { createPortal } from "react-dom";
import type { DragState } from "@/hooks/useEventDrag";
import { dateKeyToCalendarDate } from "@/lib/format/date-key";
import { eventHeightPx, PIXELS_PER_MINUTE } from "@/lib/calendar/layout-day-events";
import { formatMinutesOfDay } from "@/lib/calendar/recurrence";

type Props = {
  title: string;
  drag: DragState;
  windowStart: number;
  /** A deadline/task marker is a point in time: label it with its start only. */
  isPoint: boolean;
};

const HORIZONTAL_INSET_PX = 4;

function dayLabel(dateKey: string): string {
  const date = dateKeyToCalendarDate(dateKey);
  return date ? date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }) : dateKey;
}

/**
 * The outline of where a dragged block will land if released now — drawn over
 * the target day's column (found by its `data-date`), so it can sit in a
 * different column than the block being dragged. Portaled to <body> with
 * fixed positioning because the week grid scrolls and clips.
 */
export function DragPreviewBox({ title, drag, windowStart, isPoint }: Props) {
  const { preview } = drag;
  const column = document.querySelector<HTMLElement>(`[data-testid="day-column"][data-date="${preview.date}"]`);
  if (!column) return null;
  const rect = column.getBoundingClientRect();

  const top = rect.top + (preview.startMinutes - windowStart) * PIXELS_PER_MINUTE;
  const bottom = top + eventHeightPx(preview.startMinutes, preview.endMinutes);
  // Fixed positioning lets the box escape the grid's overflow clipping, so clip it to the scroll area by hand: a
  // target scrolled partly out of view is cut at the edge, one scrolled fully out is not drawn.
  const scrollArea = column.closest<HTMLElement>("[data-calendar-scroll]")?.getBoundingClientRect();
  const clippedTop = scrollArea ? Math.max(top, scrollArea.top) : top;
  const clippedBottom = scrollArea ? Math.min(bottom, scrollArea.bottom) : bottom;
  if (clippedBottom <= clippedTop) return null;

  const timeLabel = isPoint
    ? formatMinutesOfDay(preview.startMinutes)
    : `${formatMinutesOfDay(preview.startMinutes)}–${formatMinutesOfDay(preview.endMinutes)}`;

  return createPortal(
    <div
      data-testid="drag-preview"
      aria-hidden="true"
      className="pointer-events-none fixed z-[65] overflow-hidden rounded-control border-2 border-dashed border-accent-indigo bg-accent-indigo/20 px-2 py-1.5 text-xs text-text-primary shadow-panel-raised"
      style={{
        top: clippedTop,
        left: rect.left + HORIZONTAL_INSET_PX,
        width: rect.width - HORIZONTAL_INSET_PX * 2,
        height: clippedBottom - clippedTop,
      }}
    >
      {drag.mode === "resize" ? (
        // The block itself is still drawn underneath, so repeating its title would just collide with it:
        // show the outline plus the new time range pinned to the bottom edge being dragged.
        <p className="absolute bottom-1 right-1 rounded-full bg-bg-void/85 px-2 py-0.5 font-mono text-[10px] leading-tight">{timeLabel}</p>
      ) : (
        <>
          <p className="line-clamp-1 font-medium leading-tight">{title}</p>
          <p className="mt-0.5 font-mono text-[10px] leading-tight opacity-90">{dayLabel(preview.date)}</p>
          <p className="font-mono text-[10px] leading-tight opacity-90">{timeLabel}</p>
        </>
      )}
    </div>,
    document.body,
  );
}
