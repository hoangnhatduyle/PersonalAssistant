"use client";

import Link from "next/link";
import { STACK_PEEK_PX } from "@/lib/calendar/layout-day-events";
import { toneClasses, type StatusTone } from "@/lib/status-colors";

type Props = {
  title: string;
  timeLabel: string;
  subtitle: string;
  topPx: number;
  heightPx: number;
  leftPx: number;
  widthPx: number;
  stackIndex: number;
  stackSize: number;
  isElevated: boolean;
  tone: StatusTone;
  href: string;
  color?: string;
  onElevate: () => void;
  onCycleCluster: () => void;
};

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
  leftPx,
  widthPx,
  stackIndex,
  stackSize,
  isElevated,
  tone,
  href,
  color,
  onElevate,
  onCycleCluster,
}: Props) {
  const fullWidthPx = widthPx + stackIndex * STACK_PEEK_PX;

  return (
    <Link
      href={href}
      onMouseEnter={onElevate}
      onFocus={onElevate}
      onClick={(event) => {
        if (!isElevated) {
          event.preventDefault();
          onElevate();
        }
      }}
      className={`absolute overflow-hidden rounded-control border px-2 py-1.5 text-xs transition-[box-shadow,transform,filter,left,width] duration-150 ${
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
      <div className="flex h-full flex-col justify-start gap-0.5 py-0.5">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-xs font-medium leading-tight">{title}</p>
          {stackSize > 1 && !isElevated && stackIndex === stackSize - 1 && (
            <button
              type="button"
              aria-label={`Show ${stackSize - 1} more overlapping events`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCycleCluster();
              }}
              className="shrink-0 rounded-full bg-bg-void/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-secondary hover:text-text-primary"
            >
              +{stackSize - 1}
            </button>
          )}
        </div>
        <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{timeLabel}</p>
        <p className="line-clamp-1 text-[10px] leading-tight opacity-80">{subtitle}</p>
      </div>
    </Link>
  );
}
