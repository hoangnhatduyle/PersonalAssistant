"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { columnDateAtX, previewMove, previewResize, type ColumnBounds, type EventTimes } from "@/lib/calendar/drag-math";

type DragMode = "move" | "resize";

export interface DragState {
  mode: DragMode;
  /** Where the block would land if released now. */
  preview: EventTimes;
  /** Last pointer position (viewport coordinates), for placing a ghost. */
  pointer: { x: number; y: number };
}

interface Options {
  /** Where the block is now. */
  original: EventTimes;
  /** Deadline/task marker: it can move but not be resized (it has no duration). */
  isPoint: boolean;
  /** False for a read-only block: nothing starts. */
  enabled: boolean;
  /** Called on release with the final position (even if unchanged — the caller ignores a no-op). */
  onCommit: (times: EventTimes) => void;
}

interface Session {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  scroller: HTMLElement | null;
  active: boolean;
  lastX: number;
  lastY: number;
  preview: EventTimes | null;
  scrollSpeed: number;
  frame: number | null;
}

/** Pointer travel before a press becomes a drag; below it the press is still a click. */
const DRAG_THRESHOLD_PX = 5;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_MAX_PX_PER_FRAME = 18;
const AUTOSCROLL_MIN_PX_PER_FRAME = 2;

function readColumns(): ColumnBounds[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="day-column"]')).flatMap((element) => {
    const date = element.dataset.date;
    if (!date) return [];
    const { left, right } = element.getBoundingClientRect();
    return [{ date, left, right }];
  });
}

/**
 * Mouse drag-to-move and drag-the-bottom-edge-to-resize for one calendar
 * block, ported from TripPlanner's itinerary (see src/js/itinerary.js) with
 * what that lacks: a movement threshold (a click is still a click), Escape to
 * cancel, and auto-scroll near the grid's edges.
 *
 * Attach `startMove` to the block's onPointerDown and `startResize` to its
 * bottom handle's. While a drag is live, `drag` holds the preview (the caller
 * draws it); on release `onCommit` gets the final position.
 *
 * A real drag ends with a `click` event the browser fires on the nearest
 * common ancestor of the press and the release — often the empty column
 * background, not the block (which stays put, dimmed). That click must not
 * open the block's link or the create-event picker, so once a drag is real a
 * one-shot capture-phase click swallower is armed on `window` and is kept
 * until just after the button is actually released (so it also covers
 * pressing Escape mid-drag and then letting go).
 *
 * Only a mouse drags. Touch is how you scroll the page, and a pen on a
 * touchscreen starts a browser pan that cancels the gesture — both use the
 * Adjust time dialog instead. Events from any other pointer than the one that
 * started the drag are ignored. A wheel/trackpad scroll mid-drag recomputes
 * the preview, since the grid moved under a still pointer.
 *
 * Limitation: if the block unmounts mid-drag (a background refetch re-keys
 * it, the week changes) the drag is cleaned up without committing.
 *
 * The scroll container is found via a `data-calendar-scroll` ancestor and the
 * drop columns via `data-testid="day-column"` + `data-date` elements.
 */
export function useEventDrag(options: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /** Removes the session's pointer/keyboard/scroll listeners. */
  const teardownRef = useRef<(() => void) | null>(null);
  /** Removes the armed click swallower, if any. */
  const clickSwallowerRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const computePreview = (session: Session): EventTimes => {
    const { original, isPoint } = optionsRef.current;
    const scrolled = session.scroller ? session.scroller.scrollTop - session.startScrollTop : 0;
    const deltaYpx = session.lastY - session.startY + scrolled;
    if (session.mode === "resize") return previewResize(original, deltaYpx);
    const targetDate = columnDateAtX(session.lastX, readColumns()) ?? original.date;
    return previewMove(original, deltaYpx, targetDate, { isPoint });
  };

  const publish = (session: Session) => {
    const preview = computePreview(session);
    session.preview = preview;
    setDrag({ mode: session.mode, preview, pointer: { x: session.lastX, y: session.lastY } });
  };

  const autoscrollTick = () => {
    const session = sessionRef.current;
    if (!session || !session.active || !session.scroller || session.scrollSpeed === 0) {
      if (session) session.frame = null;
      return;
    }
    session.scroller.scrollTop += session.scrollSpeed;
    publish(session);
    session.frame = requestAnimationFrame(autoscrollTick);
  };

  const updateAutoscroll = (session: Session) => {
    if (!session.scroller) return;
    const { top, bottom } = session.scroller.getBoundingClientRect();
    const intoTop = top + AUTOSCROLL_EDGE_PX - session.lastY;
    const intoBottom = session.lastY - (bottom - AUTOSCROLL_EDGE_PX);
    const scaled = (overshoot: number) =>
      Math.max(AUTOSCROLL_MIN_PX_PER_FRAME, Math.min(AUTOSCROLL_MAX_PX_PER_FRAME, (overshoot / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_PX_PER_FRAME));
    session.scrollSpeed = intoTop > 0 ? -scaled(intoTop) : intoBottom > 0 ? scaled(intoBottom) : 0;
    if (session.scrollSpeed !== 0 && session.frame === null) session.frame = requestAnimationFrame(autoscrollTick);
  };

  /** Ends the session: listeners off, auto-scroll stopped, preview cleared. (An armed click swallower is left for releaseClickSwallowerSoon.) */
  const finish = () => {
    const session = sessionRef.current;
    if (session?.frame != null) cancelAnimationFrame(session.frame);
    sessionRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    document.body.style.removeProperty("user-select");
    setDrag(null);
  };

  const disarmClickSwallower = () => {
    clickSwallowerRef.current?.();
    clickSwallowerRef.current = null;
  };

  /** Swallow the next click anywhere (capture phase, so nothing under it sees it) — the one a real drag ends with. */
  const armClickSwallower = () => {
    disarmClickSwallower();
    const swallow = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      disarmClickSwallower();
    };
    window.addEventListener("click", swallow, true);
    clickSwallowerRef.current = () => window.removeEventListener("click", swallow, true);
  };

  /** The click (if any) follows the release immediately; don't let an unclaimed swallower eat a later, real click. */
  const releaseClickSwallowerSoon = () => {
    setTimeout(disarmClickSwallower, 0);
  };

  const begin = (mode: DragMode, event: ReactPointerEvent<HTMLElement>) => {
    const { enabled, isPoint } = optionsRef.current;
    if (!enabled || sessionRef.current) return;
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    if (mode === "resize" && isPoint) return;
    if (mode === "resize") {
      // The handle must not select text or reach the block's link underneath.
      event.preventDefault();
      event.stopPropagation();
    }

    const scroller = event.currentTarget.closest<HTMLElement>("[data-calendar-scroll]");
    const session: Session = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: scroller?.scrollTop ?? 0,
      scroller,
      active: false,
      lastX: event.clientX,
      lastY: event.clientY,
      preview: null,
      scrollSpeed: 0,
      frame: null,
    };
    sessionRef.current = session;

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return;
      session.lastX = moveEvent.clientX;
      session.lastY = moveEvent.clientY;
      if (!session.active) {
        if (Math.hypot(session.lastX - session.startX, session.lastY - session.startY) < DRAG_THRESHOLD_PX) return;
        session.active = true;
        document.body.style.setProperty("user-select", "none");
        armClickSwallower();
      }
      publish(session);
      updateAutoscroll(session);
    };
    const onScroll = () => {
      if (session.active) publish(session);
    };
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== session.pointerId) return;
      const commit = session.active ? session.preview : null;
      finish();
      if (session.active) releaseClickSwallowerSoon();
      if (commit) optionsRef.current.onCommit(commit);
    };
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== session.pointerId) return;
      finish();
      if (session.active) releaseClickSwallowerSoon();
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      const wasActive = session.active;
      finish();
      // The button is still down: keep swallowing until it is released, then the click it produces.
      if (wasActive) window.addEventListener("pointerup", releaseClickSwallowerSoon, { once: true, capture: true });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    scroller?.addEventListener("scroll", onScroll);
    teardownRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      scroller?.removeEventListener("scroll", onScroll);
    };
  };

  // A block that unmounts mid-drag (e.g. the week changes) must not leave listeners or a frame loop behind.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session?.frame != null) cancelAnimationFrame(session.frame);
      teardownRef.current?.();
      disarmClickSwallower();
      document.body.style.removeProperty("user-select");
    },
    [],
  );

  const startMove = (event: ReactPointerEvent<HTMLElement>) => begin("move", event);
  const startResize = (event: ReactPointerEvent<HTMLElement>) => begin("resize", event);

  return { drag, startMove, startResize };
}
