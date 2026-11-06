import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DragPreviewBox } from "@/components/calendar/DragPreviewBox";
import { PIXELS_PER_MINUTE } from "@/lib/calendar/layout-day-events";
import type { DragState } from "@/hooks/useEventDrag";

const WINDOW_START = 8 * 60;

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function drag(startMinutes: number, endMinutes: number, mode: DragState["mode"] = "move"): DragState {
  return { mode, preview: { date: "2026-11-05", startMinutes, endMinutes }, pointer: { x: 0, y: 0 } };
}

/** A scroll area at viewport y 100..400 holding a tall day column that starts `columnTop` px from the top of the viewport. */
function renderGrid(columnTop: number, state: DragState) {
  const makeTree = () => (
    <>
      <div data-calendar-scroll ref={(el) => { if (el) el.getBoundingClientRect = () => rect(0, 100, 600, 300); }}>
        <div
          data-testid="day-column"
          data-date="2026-11-05"
          ref={(el) => {
            if (el) el.getBoundingClientRect = () => rect(120, columnTop, 100, 1000);
          }}
        />
      </div>
      <DragPreviewBox title="Dentist" drag={state} windowStart={WINDOW_START} isPoint={false} />
    </>
  );
  const view = render(makeTree());
  // The preview reads the column's rect while rendering; in the real grid the column is long mounted, here its rect is
  // only stubbed once its ref attaches, so render again (a fresh element, or React would bail out).
  view.rerender(makeTree());
  return view;
}

describe("DragPreviewBox", () => {
  it("is drawn over the target column at the previewed time", () => {
    renderGrid(0, drag(WINDOW_START + 180, WINDOW_START + 240)); // 3 hours into the window
    expect(screen.getByTestId("drag-preview")).toHaveStyle({ top: `${180 * PIXELS_PER_MINUTE}px`, left: "124px", width: "92px" });
  });

  it("is clipped to the scroll area instead of painting over the page around it", () => {
    // Column top at y=0, so a block 60 min in starts at y=72: above the scroll area (top=100), ending at y=144.
    renderGrid(0, drag(WINDOW_START + 60, WINDOW_START + 120));
    const preview = screen.getByTestId("drag-preview");
    expect(preview).toHaveStyle({ top: "100px" });
    expect(parseFloat(preview.style.height)).toBeCloseTo(144 - 100, 5);
  });

  it("is not drawn at all when the target slot is scrolled entirely out of view", () => {
    renderGrid(0, drag(WINDOW_START, WINDOW_START + 30)); // y 0..72, all above the scroll area at 100
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument();
  });
});
