import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { CalendarEventItem } from "@/components/calendar/CalendarEventItem";
import { PIXELS_PER_MINUTE, type LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const px = (minutes: number) => minutes * PIXELS_PER_MINUTE;
const WINDOW_START = 8 * 60;

function layouted(overrides: Partial<LayoutedCalendarEvent> = {}): LayoutedCalendarEvent {
  return {
    id: "appointment-a-1",
    kind: "appointment",
    entityId: "a-1",
    occurrenceDate: "2026-11-05",
    blockIndex: null,
    occurrence: null,
    editable: true,
    title: "Dentist",
    timeLabel: "10 AM–11 AM",
    subtitle: "Health",
    startMinutes: 600,
    endMinutes: 660,
    tone: "warn",
    href: "/calendar",
    personId: null,
    personLabel: "Me",
    topPx: px(600 - WINDOW_START),
    heightPx: 72,
    visibleHeightPx: 72,
    leftPx: 4,
    widthPx: 100,
    stackIndex: 0,
    stackSize: 1,
    clusterId: "appointment-a-1",
    ...overrides,
  };
}

function stubRect(element: HTMLElement, left: number, right: number) {
  element.getBoundingClientRect = () => ({ left, right, top: 0, bottom: 800, width: right - left, height: 800, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function renderItem(props: Partial<React.ComponentProps<typeof CalendarEventItem>> = {}) {
  const onEditEvent = vi.fn();
  const onAdjustTime = vi.fn();
  const view = renderWithProviders(
    <div
      data-calendar-scroll
      ref={(el) => {
        // A tall scroll area, so the drop preview is never clipped away in these tests.
        if (el) stubRect(el, 0, 1000);
      }}
    >
      <div
        data-testid="day-column"
        data-date="2026-11-05"
        ref={(el) => {
          if (el) stubRect(el, 100, 200);
        }}
      >
        <CalendarEventItem
          event={layouted()}
          windowStart={WINDOW_START}
          isElevated={false}
          onElevate={() => {}}
          onOpenPicker={() => {}}
          onEditEvent={onEditEvent}
          onAdjustTime={onAdjustTime}
          {...props}
        />
      </div>
      <div
        data-testid="day-column"
        data-date="2026-11-06"
        ref={(el) => {
          if (el) stubRect(el, 200, 300);
        }}
      />
    </div>,
  );
  return { ...view, onEditEvent, onAdjustTime };
}

const pointer = (type: "pointerdown" | "pointermove" | "pointerup", target: Element | Window, clientX: number, clientY: number) =>
  fireEvent(target, new PointerEvent(type, { clientX, clientY, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true }));

describe("CalendarEventItem drag to move", () => {
  it("shows where the block will land while dragging and commits the new time on drop", () => {
    const { onEditEvent } = renderItem();
    pointer("pointerdown", screen.getByTestId("calendar-event"), 150, 100);
    pointer("pointermove", window, 250, 100 + px(60));

    // Thursday Nov 5 -> Friday Nov 6 column, one hour later: 11:00 AM–12:00 PM.
    const preview = screen.getByTestId("drag-preview");
    expect(preview).toHaveTextContent("11 AM–12 PM");
    expect(preview).toHaveTextContent("11/6");

    pointer("pointerup", window, 250, 100 + px(60));
    expect(onEditEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "appointment-a-1" }), { date: "2026-11-06", startMinutes: 660, endMinutes: 720 });
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument();
  });

  it("does not start dragging a read-only block", () => {
    const { onEditEvent } = renderItem({ event: layouted({ editable: false }) });
    pointer("pointerdown", screen.getByTestId("calendar-event"), 150, 100);
    pointer("pointermove", window, 250, 300);
    pointer("pointerup", window, 250, 300);
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument();
    expect(onEditEvent).not.toHaveBeenCalled();
  });

  it("dims the original block while it is being dragged", () => {
    renderItem();
    pointer("pointerdown", screen.getByTestId("calendar-event"), 150, 100);
    pointer("pointermove", window, 150, 200);
    expect(screen.getByTestId("calendar-event")).toHaveClass("opacity-40");
    pointer("pointerup", window, 150, 200);
    expect(screen.getByTestId("calendar-event")).not.toHaveClass("opacity-40");
  });
});

describe("CalendarEventItem drag to resize", () => {
  it("has a bottom handle on an editable appointment, and dragging it changes only the end", () => {
    const { onEditEvent } = renderItem({ isElevated: true });
    pointer("pointerdown", screen.getByTestId("resize-handle"), 150, 300);
    pointer("pointermove", window, 150, 300 + px(30));
    expect(screen.getByTestId("drag-preview")).toHaveTextContent("10 AM–11:30 AM");
    pointer("pointerup", window, 150, 300 + px(30));
    expect(onEditEvent).toHaveBeenCalledWith(expect.anything(), { date: "2026-11-05", startMinutes: 600, endMinutes: 690 });
  });

  it("stacks the handle with its own block, so a covered card's handle never sits over the card on top", () => {
    renderItem({ event: layouted({ stackIndex: 0, stackSize: 2 }), isElevated: false });
    // A card buried in an overlap stack offers no handle until it is brought forward (hover/focus).
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it("gives a lone, unelevated card a handle at its own stacking level, and an elevated one the control layer", () => {
    const { unmount } = renderItem({ event: layouted({ stackIndex: 0, stackSize: 1 }), isElevated: false });
    expect(screen.getByTestId("resize-handle")).toHaveStyle({ zIndex: "10" });
    unmount();
    renderItem({ event: layouted({ stackIndex: 0, stackSize: 2 }), isElevated: true });
    expect(screen.getByTestId("resize-handle")).toHaveStyle({ zIndex: "60" });
  });

  it("has no resize handle on a deadline or task, which have no duration", () => {
    renderItem({ event: layouted({ kind: "deadline", id: "deadline-d-1", entityId: "d-1", endMinutes: 645 }), isElevated: true });
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });

  it("has no handle on a read-only block", () => {
    renderItem({ event: layouted({ editable: false }), isElevated: true });
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
  });
});

describe("CalendarEventItem Adjust time button", () => {
  it("appears on an elevated editable block and opens the dialog for it", () => {
    const { onAdjustTime } = renderItem({ isElevated: true });
    fireEvent.click(screen.getByRole("button", { name: "Adjust time for Dentist" }));
    expect(onAdjustTime).toHaveBeenCalledWith(expect.objectContaining({ id: "appointment-a-1" }));
  });

  it("is not shown until the block is elevated (hover, focus or first tap)", () => {
    renderItem({ isElevated: false });
    expect(screen.queryByRole("button", { name: /Adjust time/ })).not.toBeInTheDocument();
  });

  it("is not shown for a read-only block", () => {
    renderItem({ event: layouted({ editable: false }), isElevated: true });
    expect(screen.queryByRole("button", { name: /Adjust time/ })).not.toBeInTheDocument();
  });
});
