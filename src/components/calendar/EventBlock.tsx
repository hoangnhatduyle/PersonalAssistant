"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { EventHoverCard } from "@/components/calendar/EventHoverCard";
import { STACK_PEEK_PX } from "@/lib/calendar/layout-day-events";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  title: string;
  timeLabel: string;
  subtitle: string;
  topPx: number;
  heightPx: number;
  /** Portion of the card not covered by a card stacked on top; decides whether detail lines fit. */
  visibleHeightPx: number;
  leftPx: number;
  widthPx: number;
  stackIndex: number;
  stackSize: number;
  isElevated: boolean;
  tone: StatusTone;
  href: string;
  color?: string;
  onElevate: () => void;
  onOpenPicker: (anchorRect: DOMRect) => void;
};

/** Below this visible height the time and location lines would clip or collide, so only the title is shown. */
const FULL_DETAIL_MIN_HEIGHT_PX = 56;

function glowShadow(color?: string): string {
  if (color) return `0 0 0 2px ${color}, 0 0 28px -4px color-mix(in srgb, ${color} 70%, transparent)`;
  return "0 0 0 2px rgb(99 102 241 / 0.85), 0 0 28px -4px rgb(99 102 241 / 0.65)";
}

/**
 * Indigo (`accent` tone) for the account owner's own courses; the deadline/
 * task status-tone maps for their deadlines/tasks. When `color` is set (a
 * tracked Person's event, not the account owner's own — see
 * src/lib/calendar/build-week-events.ts), it renders via inline style
 * instead, so an arbitrary number of people can each get a distinct color
 * without needing a StatusTone entry per person.
 */
export function EventBlock({
  title,
  timeLabel,
  subtitle,
  topPx,
  heightPx,
  visibleHeightPx,
  leftPx,
  widthPx,
  stackIndex,
  stackSize,
  isElevated,
  tone,
  href,
  color,
  onElevate,
  onOpenPicker,
}: Props) {
  const fullWidthPx = widthPx + stackIndex * STACK_PEEK_PX;
  const isTitleOnly = visibleHeightPx < FULL_DETAIL_MIN_HEIGHT_PX;
  const tooltipId = useId();
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const closeHoverCard = useCallback(() => setHoverRect(null), []);

  return (
    <Link
      href={href}
      title={isTitleOnly ? undefined : `${title} · ${timeLabel}${subtitle ? ` · ${subtitle}` : ""}`}
      aria-describedby={isTitleOnly && hoverRect ? tooltipId : undefined}
      onMouseEnter={(event) => {
        onElevate();
        if (isTitleOnly) setHoverRect(event.currentTarget.getBoundingClientRect());
      }}
      onMouseLeave={closeHoverCard}
      onFocus={(event) => {
        onElevate();
        if (isTitleOnly) setHoverRect(event.currentTarget.getBoundingClientRect());
      }}
      onBlur={closeHoverCard}
      onClick={(event) => {
        if (stackSize > 1) {
          event.preventDefault();
          onOpenPicker(event.currentTarget.getBoundingClientRect());
          return;
        }
        if (!isElevated) {
          event.preventDefault();
          onElevate();
        }
      }}
      className={`absolute overflow-hidden rounded-control border px-2 ${isTitleOnly ? "py-0.5" : "py-1.5"} text-xs transition-[box-shadow,transform,filter,left,width] duration-150 ${
        color ? "" : toneClasses(tone)
      } ${isElevated ? "z-50 scale-[1.02] brightness-125" : ""}`}
      style={{
        top: topPx,
        left: isElevated ? 4 : leftPx,
        width: isElevated ? fullWidthPx : widthPx,
        height: heightPx,
        zIndex: isElevated ? 50 : 10 + stackIndex,
        boxShadow: isElevated ? glowShadow(color) : undefined,
        ...(color ? { backgroundColor: `${color}26`, borderColor: `${color}66`, color } : {}),
      }}
    >
      <div className={`flex h-full flex-col justify-start gap-0.5 ${isTitleOnly ? "" : "py-0.5"}`}>
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-xs font-medium leading-tight">{title}</p>
          <span className="flex shrink-0 items-center gap-1">
            {isTitleOnly && (
              <span
                aria-hidden="true"
                className="rounded-full bg-bg-void/70 px-1.5 font-mono text-[10px] font-semibold leading-4"
              >
                ⋯
              </span>
            )}
            {stackSize > 1 && !isElevated && stackIndex === stackSize - 1 && (
              <span
                aria-hidden="true"
                className="rounded-full bg-bg-void/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-secondary"
              >
                +{stackSize - 1}
              </span>
            )}
          </span>
        </div>
        {!isTitleOnly && (
          <>
            <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{timeLabel}</p>
            <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{subtitle}</p>
          </>
        )}
      </div>
      {isTitleOnly && hoverRect && (
        <EventHoverCard
          id={tooltipId}
          title={title}
          timeLabel={timeLabel}
          subtitle={subtitle}
          tone={tone}
          color={color}
          anchorRect={hoverRect}
          onClose={closeHoverCard}
        />
      )}
    </Link>
  );
}
