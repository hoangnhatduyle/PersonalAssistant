"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { buildUpcomingItems, type UpcomingItem } from "@/lib/dashboard/upcoming-items";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { DeadlineRow, ReminderRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
  reminders: ReminderRow[];
};

const RING_ITEM_LIMIT = 5;
const CLOCK_TICK_MS = 30_000;
const CENTER = 150;
const RING_RADIUS = 108;
const DOT_RADIUS = 128;
const LABEL_RADIUS = 148;

function polarPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

const KIND_FILL_CLASS: Record<UpcomingItem["kind"], string> = {
  deadline: "fill-status-urgent",
  task: "fill-accent-indigo",
  reminder: "fill-accent-teal",
  todo: "fill-accent-violet",
};

const KIND_BG_CLASS: Record<UpcomingItem["kind"], string> = {
  deadline: "bg-status-urgent",
  task: "bg-accent-indigo",
  reminder: "bg-accent-teal",
  todo: "bg-accent-violet",
};

function truncate(title: string, max = 16): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

const subscribeNoop = () => () => {};

/**
 * `new Date()` differs between server render and client hydration by
 * however long the network round-trip took — rendering it unconditionally
 * would be a real hydration mismatch the instant that gap crosses a minute
 * boundary. Mirrors ToastProvider's useIsMounted: false until the first
 * client render, true from then on, with no setState-in-effect render pass.
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * Radial "now" centerpiece: a live clock at the center, with the next few
 * upcoming Deadlines/Tasks/Reminders (merged/sorted by due_at/trigger_at)
 * spread evenly around the ring. The SVG dial is decorative (aria-hidden);
 * the list below it is the actual accessible content.
 */
export function NowWidget({ deadlines, tasks, reminders }: Props) {
  const isMounted = useIsMounted();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((tick) => tick + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const now = isMounted ? new Date() : null;

  const items = buildUpcomingItems({ deadlines, tasks, reminders }).slice(0, RING_ITEM_LIMIT);
  const tickAngles = Array.from({ length: 12 }, (_, index) => index * 30);

  return (
    <GlassPanel variant="glow-ok" className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start">
      <svg viewBox="0 0 300 300" aria-hidden="true" className="h-64 w-64 flex-shrink-0">
        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} className="fill-none stroke-panel-border" strokeWidth={1.5} />
        {tickAngles.map((angle) => {
          const inner = polarPoint(RING_RADIUS - 6, angle);
          const outer = polarPoint(RING_RADIUS + 6, angle);
          return (
            <line
              key={angle}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="stroke-panel-border-hover"
              strokeWidth={1}
            />
          );
        })}

        <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="fill-text-primary font-display text-2xl font-semibold">
          {now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
        </text>
        <text x={CENTER} y={CENTER + 16} textAnchor="middle" className="fill-text-secondary font-mono text-[10px] uppercase tracking-wide">
          {now ? now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) : ""}
        </text>

        {items.map((item, index) => {
          const angle = (360 / items.length) * index;
          const dot = polarPoint(DOT_RADIUS, angle);
          const label = polarPoint(LABEL_RADIUS, angle);
          const anchor = label.x < CENTER - 4 ? "end" : label.x > CENTER + 4 ? "start" : "middle";

          return (
            <g key={`${item.kind}-${item.id}`}>
              <circle cx={dot.x} cy={dot.y} r={5} className={item.urgent ? "fill-status-urgent" : KIND_FILL_CLASS[item.kind]} />
              <text
                x={label.x}
                y={label.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="fill-text-secondary font-mono text-[9px]"
              >
                {truncate(item.title)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex w-full flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Next up</p>
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">Nothing on the radar — you&apos;re clear.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${item.urgent ? "bg-status-urgent" : KIND_BG_CLASS[item.kind]}`}
                  />
                  {item.href ? (
                    <Link href={item.href} className="truncate text-text-primary hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="truncate text-text-primary">{item.title}</span>
                  )}
                </span>
                <span className={`flex-shrink-0 font-mono text-xs ${item.urgent ? "text-status-urgent" : "text-text-secondary"}`}>
                  {now ? formatRelativeTime(item.at, now) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
}
