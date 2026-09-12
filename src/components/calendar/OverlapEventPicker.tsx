"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

export type PickerEvent = {
  id: string;
  title: string;
  timeLabel: string;
  subtitle: string;
  tone: StatusTone;
  href: string;
  color?: string;
};

type Props = {
  events: PickerEvent[];
  anchorRect: DOMRect;
  onClose: () => void;
};

const PANEL_WIDTH_PX = 260;
const PANEL_MAX_HEIGHT_PX = 288;
const VIEWPORT_MARGIN_PX = 8;

/**
 * Floating list shown when a calendar slot has more overlapping events than
 * the stacked cards can render legibly — lets you pick the exact one you
 * meant instead of hunting for a thin sliver of a hidden card. Portaled to
 * <body> with fixed positioning (not the day column's own relative box)
 * because WeekGrid's `overflow-auto` scroll container would clip an
 * absolutely-positioned child instead of letting it float above the grid.
 */
export function OverlapEventPicker({ events, anchorRect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Closes on any scroll (including inside WeekGrid's own scroll
    // container, via the capture phase) rather than re-tracking position —
    // the anchor card moves under a fixed-position popover once its
    // scroll container scrolls, so keeping it open would look disconnected.
    const handleScroll = () => onClose();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const overflowsRight = anchorRect.left + PANEL_WIDTH_PX + VIEWPORT_MARGIN_PX > window.innerWidth;
  const left = overflowsRight
    ? Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - PANEL_WIDTH_PX - VIEWPORT_MARGIN_PX)
    : anchorRect.left;

  const overflowsBottom =
    anchorRect.bottom + 4 + PANEL_MAX_HEIGHT_PX + VIEWPORT_MARGIN_PX > window.innerHeight;
  const top = overflowsBottom
    ? Math.max(VIEWPORT_MARGIN_PX, anchorRect.top - 4 - PANEL_MAX_HEIGHT_PX)
    : anchorRect.bottom + 4;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[60] flex flex-col gap-1 overflow-y-auto rounded-panel border border-panel-border bg-bg-void-elevated p-2 shadow-panel-raised"
      style={{ top, left, width: PANEL_WIDTH_PX, maxHeight: PANEL_MAX_HEIGHT_PX }}
    >
      <p className="px-1.5 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">
        {events.length} overlapping events
      </p>
      {events.map((event) => (
        <Link
          key={event.id}
          href={event.href}
          onClick={onClose}
          className={`flex flex-col gap-0.5 rounded-control border px-2 py-1.5 text-xs transition-colors hover:brightness-125 ${
            event.color ? "border-transparent" : toneClasses(event.tone)
          }`}
          style={
            event.color
              ? { backgroundColor: `${event.color}26`, borderColor: `${event.color}66`, color: event.color }
              : undefined
          }
        >
          <span className="line-clamp-1 font-medium">{event.title}</span>
          <span className="line-clamp-1 opacity-80">
            {event.timeLabel} · {event.subtitle}
          </span>
        </Link>
      ))}
    </div>,
    document.body,
  );
}
