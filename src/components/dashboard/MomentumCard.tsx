"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { buildUpcomingItems } from "@/lib/dashboard/upcoming-items";
import {
  buildCompletionTrend,
  buildCompletedThisWeek,
  buildCycleTimeStats,
  buildOnTimeCompletionRate,
  buildNetBacklogDelta,
  buildCycleTimeSparkline,
  type CompletedItem,
} from "@/lib/dashboard/completion-trend";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
};

const COLLAPSED_LIMIT = 5;

const KIND_LABEL: Record<CompletedItem["kind"], string> = {
  deadline: "Deadline",
  task: "Task",
};

const SPARKLINE_WIDTH = 140;
const SPARKLINE_HEIGHT = 40;
const SPARKLINE_PAD = 4;
const SPARKLINE_TOP = 4;
const SPARKLINE_BASELINE = 36;

/**
 * "Focus hours remaining" until the nearest upcoming Deadline or Task with a
 * due date. Course-meeting time isn't factored in: meeting_pattern has no
 * parser until the Calendar step. The stat row and sparkline measure pace
 * (cycle time, on-time rate, backlog delta) rather than raw activity volume
 * — see completion-trend.ts for why updated_at stands in for completed_at.
 */
export function MomentumCard({ deadlines, tasks }: Props) {
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const nearestItem = buildUpcomingItems({ deadlines, tasks }).find((item) => item.at.getTime() > now.getTime());
  const hoursRemaining = nearestItem ? Math.round((nearestItem.at.getTime() - now.getTime()) / 3_600_000) : null;

  const completedThisWeek = buildCompletionTrend(deadlines, tasks).reduce((sum, value) => sum + value, 0);
  const completedItems = buildCompletedThisWeek(deadlines, tasks);
  const cycleTime = buildCycleTimeStats(deadlines, tasks);
  const onTime = buildOnTimeCompletionRate(deadlines, tasks);
  const backlog = buildNetBacklogDelta(deadlines, tasks);

  const sparklineTrend = buildCycleTimeSparkline(deadlines, tasks);
  const max = Math.max(1, ...sparklineTrend);
  const step = sparklineTrend.length > 1 ? (SPARKLINE_WIDTH - SPARKLINE_PAD * 2) / (sparklineTrend.length - 1) : 0;
  const points = sparklineTrend
    .map((value, index) => {
      const x = SPARKLINE_PAD + index * step;
      const y = SPARKLINE_BASELINE - (value / max) * (SPARKLINE_BASELINE - SPARKLINE_TOP);
      return `${x},${y}`;
    })
    .join(" ");

  const cycleTimeArrow = cycleTime.deltaDays === null ? "" : cycleTime.deltaDays < 0 ? "↓" : cycleTime.deltaDays > 0 ? "↑" : "→";
  const backlogLabel = `${backlog.delta >= 0 ? "+" : ""}${backlog.delta}`;

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Momentum</p>

      {nearestItem ? (
        <div>
          <p className="font-display text-3xl font-semibold text-text-primary">
            {hoursRemaining}
            <span className="ml-1 text-base font-normal text-text-secondary">focus hrs left</span>
          </p>
          <Link href={nearestItem.href ?? "#"} className="text-xs text-text-secondary hover:text-accent-indigo hover:underline">
            until &quot;{nearestItem.title}&quot;
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No upcoming deadlines or tasks on the horizon.</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="font-mono text-xs text-text-secondary">Cycle time</p>
          <p className="font-display text-lg font-semibold text-text-primary">
            {cycleTime.thisWeekAvgDays === null ? "—" : `${cycleTime.thisWeekAvgDays.toFixed(1)}d`}
            {cycleTimeArrow && <span className="ml-1 text-sm font-normal text-text-secondary">{cycleTimeArrow}</span>}
          </p>
          <p className="font-mono text-[10px] text-text-secondary">
            {cycleTime.lastWeekAvgDays === null ? "avg" : `from ${cycleTime.lastWeekAvgDays.toFixed(1)}d`}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-text-secondary">On-time</p>
          <p className="font-display text-lg font-semibold text-text-primary">
            {onTime.rate === null ? "No data" : `${Math.round(onTime.rate)}%`}
          </p>
          <p className="font-mono text-[10px] text-text-secondary">
            {onTime.eligibleCount === 0 ? "—" : `${onTime.onTimeCount}/${onTime.eligibleCount}`}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-text-secondary">Net backlog</p>
          <p className="font-display text-lg font-semibold text-text-primary">{backlogLabel}</p>
          <p className="font-mono text-[10px] text-text-secondary">net this week</p>
        </div>
      </div>

      <div>
        <svg viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} aria-hidden="true" className="h-10 w-full">
          <polyline points={points} fill="none" className="stroke-accent-teal" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-1 font-mono text-xs text-text-secondary">
          {completedThisWeek} resolved this week
          {cycleTime.thisWeekAvgDays !== null && ` · avg ${cycleTime.thisWeekAvgDays.toFixed(1)}d cycle time`}
        </p>
      </div>

      {completedItems.length === 0 ? (
        <p className="text-xs text-text-secondary">Nothing resolved yet this week.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-panel-border">
            {(expanded ? completedItems : completedItems.slice(0, COLLAPSED_LIMIT)).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-col py-2 first:pt-0 last:pb-0">
                <Link href={item.href} className="truncate text-xs text-text-primary hover:underline">
                  {item.title}
                </Link>
                <span className="font-mono text-[10px] text-text-secondary">
                  {KIND_LABEL[item.kind]} · {formatRelativeTime(item.at, now)}
                </span>
              </li>
            ))}
          </ul>
          {completedItems.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
            >
              {expanded ? "Show less" : `Show all (${completedItems.length})`}
            </button>
          )}
        </>
      )}
    </GlassPanel>
  );
}
