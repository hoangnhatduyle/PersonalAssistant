"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";
import { STACK_PEEK_PX } from "@/lib/calendar/layout-day-events";

type Props = {
  event: LayoutedCalendarEvent;
  isElevated: boolean;
  /** A bottom drag handle — not for a deadline/task marker, which has no duration. */
  canResize: boolean;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onAdjustTime: () => void;
};

const HANDLE_HEIGHT_PX = 12;
const BUTTON_SIZE_PX = 24;
const BUTTON_INSET_PX = 4;
/** Above an elevated EventBlock (z-50) so the controls stay reachable. */
const CONTROLS_Z_INDEX = 60;

/**
 * What an editable calendar block offers besides dragging its body: a bottom
 * edge to drag-resize (mouse and pen only — touch scrolls instead) and an
 * "Adjust time" button that opens the form (the way to edit on a phone or
 * from a keyboard).
 *
 * These are siblings of the block, not children: EventBlock is a link, and a
 * button or drag handle nested in an anchor is invalid HTML. They are placed
 * from the same layout numbers, tracking EventBlock's elevated geometry.
 */
export function EventEditControls({ event, isElevated, canResize, onResizeStart, onAdjustTime }: Props) {
  const left = isElevated ? 4 : event.leftPx;
  const width = isElevated ? event.widthPx + event.stackIndex * STACK_PEEK_PX : event.widthPx;

  // A card buried in an overlap stack gets no handle until it is elevated: its bottom edge usually lies under
  // the card stacked on top, and a handle there would resize the wrong event and swallow the top card's clicks.
  const showHandle = canResize && (isElevated || event.stackSize === 1);
  // At the block's own stacking level (sibling order then keeps later cards above it), or the control layer once elevated.
  const handleZIndex = isElevated ? CONTROLS_Z_INDEX : 10 + event.stackIndex;

  return (
    <>
      {showHandle && (
        <div
          data-testid="resize-handle"
          aria-hidden="true"
          onPointerDown={onResizeStart}
          className="group absolute hidden cursor-ns-resize touch-none [@media(pointer:fine)]:block"
          style={{ left, width, top: event.topPx + event.heightPx - HANDLE_HEIGHT_PX / 2, height: HANDLE_HEIGHT_PX, zIndex: handleZIndex }}
        >
          <span className="pointer-events-none mx-auto mt-1 block h-1 w-8 rounded-full bg-text-secondary opacity-0 transition-opacity group-hover:opacity-80" />
        </div>
      )}
      {isElevated && (
        <button
          type="button"
          aria-label={`Adjust time for ${event.title}`}
          title="Adjust time"
          onClick={onAdjustTime}
          className="absolute flex items-center justify-center rounded-control border border-panel-border bg-bg-void-elevated/95 text-text-primary transition-colors hover:border-panel-border-hover hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/60"
          style={{
            left: left + width - BUTTON_SIZE_PX - BUTTON_INSET_PX,
            top: event.topPx + BUTTON_INSET_PX,
            width: BUTTON_SIZE_PX,
            height: BUTTON_SIZE_PX,
            zIndex: CONTROLS_Z_INDEX,
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </button>
      )}
    </>
  );
}
