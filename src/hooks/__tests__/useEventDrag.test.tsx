import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEventDrag } from "@/hooks/useEventDrag";
import { PIXELS_PER_MINUTE } from "@/lib/calendar/layout-day-events";
import type { EventTimes } from "@/lib/calendar/drag-math";

const px = (minutes: number) => minutes * PIXELS_PER_MINUTE;

const ORIGINAL: EventTimes = { date: "2026-11-05", startMinutes: 600, endMinutes: 660 };

function stubRect(element: HTMLElement, left: number, right: number) {
  element.getBoundingClientRect = () => ({ left, right, top: 0, bottom: 600, width: right - left, height: 600, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function Harness({
  isPoint = false,
  enabled = true,
  onCommit,
  onClick = () => {},
  onBackgroundClick = () => {},
}: {
  isPoint?: boolean;
  enabled?: boolean;
  onCommit: (times: EventTimes) => void;
  onClick?: () => void;
  onBackgroundClick?: () => void;
}) {
  const { drag, startMove, startResize } = useEventDrag({ original: ORIGINAL, isPoint, enabled, onCommit });
  return (
    <div data-calendar-scroll>
      <div data-testid="day-column" data-date="2026-11-05" ref={(el) => {
          if (el) stubRect(el, 100, 200);
        }} />
      <div data-testid="day-column" data-date="2026-11-06" ref={(el) => {
          if (el) stubRect(el, 200, 300);
        }} />
      <button type="button" data-testid="block" onPointerDown={startMove} onClick={onClick} />
      <div data-testid="handle" onPointerDown={startResize} />
      <div data-testid="background" onClick={onBackgroundClick} />
      <output data-testid="state">{drag ? JSON.stringify(drag) : "idle"}</output>
    </div>
  );
}

const state = () => {
  const text = screen.getByTestId("state").textContent!;
  return text === "idle" ? null : JSON.parse(text);
};

const pointer = (type: "pointerdown" | "pointermove" | "pointerup", target: Element | Window, clientX: number, clientY: number, init: PointerEventInit = {}) => {
  const event = new PointerEvent(type, { clientX, clientY, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, ...init });
  fireEvent(target, event);
};

afterEach(() => vi.restoreAllMocks());

describe("useEventDrag: move", () => {
  it("previews the new time as the pointer travels and commits it on release", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 150, 100 + px(50));

    expect(state()).toMatchObject({ mode: "move", preview: { date: "2026-11-05", startMinutes: 645, endMinutes: 705 } });

    pointer("pointerup", window, 150, 100 + px(50));
    expect(onCommit).toHaveBeenCalledWith({ date: "2026-11-05", startMinutes: 645, endMinutes: 705 });
    expect(state()).toBeNull();
  });

  it("takes the date of the column under the pointer", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 250, 100);
    expect(state()?.preview).toEqual({ date: "2026-11-06", startMinutes: 600, endMinutes: 660 });
    pointer("pointerup", window, 250, 100);
    expect(onCommit).toHaveBeenCalledWith({ date: "2026-11-06", startMinutes: 600, endMinutes: 660 });
  });

  it("is not a drag until the pointer has travelled a few pixels, so a click stays a click", () => {
    const onCommit = vi.fn();
    const onClick = vi.fn();
    render(<Harness onCommit={onCommit} onClick={onClick} />);
    const block = screen.getByTestId("block");
    pointer("pointerdown", block, 150, 100);
    pointer("pointermove", window, 152, 101);
    expect(state()).toBeNull();
    pointer("pointerup", window, 152, 101);
    fireEvent.click(block);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("swallows the click a real drag ends with — on the block or on the empty background it was dropped over — once", () => {
    const onClick = vi.fn();
    const onBackgroundClick = vi.fn();
    render(<Harness onCommit={() => {}} onClick={onClick} onBackgroundClick={onBackgroundClick} />);
    const block = screen.getByTestId("block");
    pointer("pointerdown", block, 150, 100);
    pointer("pointermove", window, 150, 200);
    pointer("pointerup", window, 150, 200);

    // The browser fires the click on the common ancestor of press and release; a drop over empty
    // background must not reach a create-event handler there.
    fireEvent.click(screen.getByTestId("background"));
    expect(onBackgroundClick).not.toHaveBeenCalled();

    // ...and only that one click: the next is a real click.
    fireEvent.click(block);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not swallow an ordinary click that was never a drag", () => {
    const onBackgroundClick = vi.fn();
    render(<Harness onCommit={() => {}} onBackgroundClick={onBackgroundClick} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointerup", window, 150, 100);
    fireEvent.click(screen.getByTestId("background"));
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it("after Escape, still swallows the click from releasing the button", () => {
    const onBackgroundClick = vi.fn();
    render(<Harness onCommit={() => {}} onBackgroundClick={onBackgroundClick} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 150, 250);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state()).toBeNull();

    pointer("pointerup", window, 150, 250);
    fireEvent.click(screen.getByTestId("background"));
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it("Escape cancels the drag without committing", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 150, 250);
    expect(state()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(state()).toBeNull();

    pointer("pointerup", window, 150, 250);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("useEventDrag: resize", () => {
  it("moves only the end and commits it on release", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("handle"), 150, 300);
    pointer("pointermove", window, 150, 300 + px(40));

    expect(state()).toMatchObject({ mode: "resize", preview: { date: "2026-11-05", startMinutes: 600, endMinutes: 705 } });

    pointer("pointerup", window, 150, 300 + px(40));
    expect(onCommit).toHaveBeenCalledWith({ date: "2026-11-05", startMinutes: 600, endMinutes: 705 });
  });

  it("does nothing for a point marker (deadline/task have no duration)", () => {
    const onCommit = vi.fn();
    render(<Harness isPoint onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("handle"), 150, 300);
    pointer("pointermove", window, 150, 400);
    expect(state()).toBeNull();
    pointer("pointerup", window, 150, 400);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("useEventDrag: what starts a drag", () => {
  it("ignores touch and pen — only a mouse drags; the Adjust time dialog covers the rest", () => {
    render(<Harness onCommit={() => {}} />);
    for (const pointerType of ["touch", "pen"]) {
      pointer("pointerdown", screen.getByTestId("block"), 150, 100, { pointerType });
      pointer("pointermove", window, 150, 300, { pointerType });
      expect(state()).toBeNull();
      pointer("pointerup", window, 150, 300, { pointerType });
    }
  });

  it("ignores a second pointer while one is dragging", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100, { pointerId: 1 });
    pointer("pointermove", window, 150, 200, { pointerId: 1 });
    const before = state();
    pointer("pointermove", window, 150, 500, { pointerId: 2 });
    expect(state()).toEqual(before);
    pointer("pointerup", window, 150, 500, { pointerId: 2 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(state()).not.toBeNull();
    pointer("pointerup", window, 150, 200, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("recomputes the preview when the grid scrolls under a stationary pointer", () => {
    render(<Harness onCommit={() => {}} />);
    const scroller = document.querySelector("[data-calendar-scroll]") as HTMLElement;
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 150, 100 + px(30));
    expect(state()?.preview.startMinutes).toBe(630);

    scroller.scrollTop = px(30);
    fireEvent.scroll(scroller);
    expect(state()?.preview.startMinutes).toBe(660);
  });

  it("ignores a non-primary button", () => {
    render(<Harness onCommit={() => {}} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100, { button: 2, buttons: 2 });
    pointer("pointermove", window, 150, 300);
    expect(state()).toBeNull();
  });

  it("does nothing when the block is not editable", () => {
    render(<Harness enabled={false} onCommit={() => {}} />);
    pointer("pointerdown", screen.getByTestId("block"), 150, 100);
    pointer("pointermove", window, 150, 300);
    expect(state()).toBeNull();
  });
});
