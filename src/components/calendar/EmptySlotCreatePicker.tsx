"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type CreateEntityType = "appointment" | "task" | "deadline" | "course";

type Props = {
  anchorRect: DOMRect;
  onSelect: (type: CreateEntityType) => void;
  onClose: () => void;
};

const PANEL_WIDTH_PX = 200;
const VIEWPORT_MARGIN_PX = 8;

const OPTIONS: { type: CreateEntityType; label: string }[] = [
  { type: "appointment", label: "Appointment" },
  { type: "task", label: "Task" },
  { type: "deadline", label: "Deadline" },
  { type: "course", label: "Course" },
];

/**
 * Floating type picker shown when an empty calendar slot is clicked — lets
 * the user choose which of the four creatable entities to add there before
 * that entity's own form opens, pre-filled with the clicked date/time.
 * Positioning/dismissal logic mirrors OverlapEventPicker.tsx (portaled to
 * <body> with fixed positioning so WeekGrid's `overflow-auto` scroll
 * container doesn't clip it).
 */
export function EmptySlotCreatePicker({ anchorRect, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
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
  const top = Math.min(anchorRect.top, window.innerHeight - VIEWPORT_MARGIN_PX);

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[60] flex flex-col gap-1 rounded-panel border border-panel-border bg-bg-void-elevated p-2 shadow-panel-raised"
      style={{ top, left, width: PANEL_WIDTH_PX }}
    >
      <p className="px-1.5 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-eyebrow">Add to calendar</p>
      {OPTIONS.map((option) => (
        <button
          key={option.type}
          type="button"
          role="menuitem"
          onClick={() => onSelect(option.type)}
          className="rounded-control px-2 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-panel-border/50"
        >
          {option.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
