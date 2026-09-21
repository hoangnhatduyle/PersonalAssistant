"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  id: string;
  title: string;
  timeLabel: string;
  subtitle: string;
  tone: StatusTone;
  color?: string;
  anchorRect: DOMRect;
  onClose: () => void;
};

const CARD_WIDTH_PX = 240;
const CARD_ESTIMATED_HEIGHT_PX = 96;
const ANCHOR_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;

/**
 * Tooltip for calendar blocks too short to show more than a title. Portaled to
 * <body> with fixed positioning because both the block (`overflow-hidden`) and
 * WeekGrid's scroll container would clip anything rendered inside them.
 * Non-interactive: it only appears while the block is hovered or focused, and
 * closes on scroll since the block moves out from under a fixed-position card.
 */
export function EventHoverCard({ id, title, timeLabel, subtitle, tone, color, anchorRect, onClose }: Props) {
  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  const maxLeft = window.innerWidth - CARD_WIDTH_PX - VIEWPORT_MARGIN_PX;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(anchorRect.left, maxLeft));

  const fitsBelow = anchorRect.bottom + ANCHOR_GAP_PX + CARD_ESTIMATED_HEIGHT_PX + VIEWPORT_MARGIN_PX <= window.innerHeight;
  const placement = fitsBelow
    ? { top: anchorRect.bottom + ANCHOR_GAP_PX }
    : { bottom: window.innerHeight - anchorRect.top + ANCHOR_GAP_PX };

  return createPortal(
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[70] flex flex-col gap-1 rounded-panel border border-panel-border bg-bg-void-elevated p-3 shadow-panel-raised"
      style={{ ...placement, left, width: CARD_WIDTH_PX }}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`mt-1 size-2 shrink-0 rounded-full border ${color ? "" : toneClasses(tone)}`}
          style={color ? { backgroundColor: color, borderColor: color } : undefined}
        />
        <p className="text-sm font-medium leading-snug text-text-primary">{title}</p>
      </div>
      <p className="pl-4 font-mono text-[11px] text-text-secondary">{timeLabel}</p>
      {subtitle && <p className="pl-4 text-xs text-text-secondary">{subtitle}</p>}
    </div>,
    document.body,
  );
}
