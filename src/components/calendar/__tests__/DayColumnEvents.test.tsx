import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DayColumnEvents, type CreateRequest } from "@/components/calendar/DayColumnEvents";
import { PIXELS_PER_MINUTE, type LayoutedCalendarEvent } from "@/lib/calendar/layout-day-events";

// DayColumnEvents' events render via next/link (through EventBlock); this
// test only exercises click routing (background vs. event card), not real
// navigation, so a plain anchor stands in for it.
vi.mock("next/link", () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: (event: React.MouseEvent) => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

const WINDOW_START = 8 * 60;

const layoutedEvent: LayoutedCalendarEvent = {
  id: "e-1",
  title: "Standup",
  timeLabel: "10 AM–11 AM",
  subtitle: "Room 1",
  startMinutes: 600,
  endMinutes: 660,
  tone: "accent",
  href: "/x",
  personId: null,
  personLabel: "Me",
  topPx: 0,
  heightPx: 60,
  visibleHeightPx: 60,
  leftPx: 4,
  widthPx: 100,
  stackIndex: 0,
  stackSize: 1,
  clusterId: "e-1",
};

function renderColumn(onCreateRequest: (request: CreateRequest) => void, events: LayoutedCalendarEvent[] = []) {
  return renderWithProviders(
    <DayColumnEvents
      isToday={false}
      date="2026-01-06"
      events={events}
      hourMarks={[WINDOW_START]}
      windowStart={WINDOW_START}
      gridHeightPx={600}
      onCreateRequest={onCreateRequest}
    />,
  );
}

describe("DayColumnEvents empty-slot click", () => {
  it("opens the create picker when the background is clicked, with the clicked time snapped", () => {
    const onCreateRequest = vi.fn();
    const { container } = renderColumn(onCreateRequest);

    const column = container.firstElementChild as HTMLElement;
    // 90 minutes below windowStart in pixel terms; already a multiple of the 30-minute snap.
    fireEvent.click(column, { clientX: 40, clientY: 90 * PIXELS_PER_MINUTE });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Appointment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Appointment" }));
    expect(onCreateRequest).toHaveBeenCalledWith({ type: "appointment", date: "2026-01-06", minutes: WINDOW_START + 90 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not open the create picker when an event card is clicked", () => {
    const onCreateRequest = vi.fn();
    renderColumn(onCreateRequest, [layoutedEvent]);

    fireEvent.click(screen.getByRole("link", { name: /Standup/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onCreateRequest).not.toHaveBeenCalled();
  });
});

describe("DayColumnEvents hover preview", () => {
  it("shows the slot's start time while hovering empty space", () => {
    const { container } = renderColumn(vi.fn());
    const column = container.firstElementChild as HTMLElement;

    fireEvent.mouseMove(column, { clientY: 90 * PIXELS_PER_MINUTE });

    expect(screen.getByText("9:30 AM")).toBeInTheDocument();
  });

  it("hides the preview once the pointer leaves the column", () => {
    const { container } = renderColumn(vi.fn());
    const column = container.firstElementChild as HTMLElement;

    fireEvent.mouseMove(column, { clientY: 90 * PIXELS_PER_MINUTE });
    expect(screen.getByText("9:30 AM")).toBeInTheDocument();

    fireEvent.mouseLeave(column);
    expect(screen.queryByText("9:30 AM")).not.toBeInTheDocument();
  });

  it("does not show a start-time preview while hovering an event card", () => {
    renderColumn(vi.fn(), [layoutedEvent]);

    fireEvent.mouseMove(screen.getByRole("link", { name: /Standup/ }));

    expect(screen.queryByText("9:30 AM")).not.toBeInTheDocument();
  });

  it("hides the preview once the create picker opens at that spot", () => {
    const { container } = renderColumn(vi.fn());
    const column = container.firstElementChild as HTMLElement;

    fireEvent.mouseMove(column, { clientY: 90 * PIXELS_PER_MINUTE });
    expect(screen.getByText("9:30 AM")).toBeInTheDocument();

    fireEvent.click(column, { clientX: 40, clientY: 90 * PIXELS_PER_MINUTE });
    expect(screen.queryByText("9:30 AM")).not.toBeInTheDocument();
  });
});
