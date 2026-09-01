import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { buildUpcomingItems } from "@/lib/dashboard/upcoming-items";
import { buildCompletionTrend, buildCompletedThisWeek } from "@/lib/dashboard/completion-trend";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { DeadlineRow, TaskRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  tasks: TaskRow[];
};

const SPARKLINE_WIDTH = 140;
const SPARKLINE_HEIGHT = 40;
const SPARKLINE_PAD = 4;
const SPARKLINE_TOP = 4;
const SPARKLINE_BASELINE = 36;

/**
 * "Focus hours remaining" until the nearest hard deadline (tasks don't
 * count — they're not hard commitments). Course-meeting time isn't factored
 * in: meeting_pattern has no parser until the Calendar step. The sparkline
 * is a real trend (resolved Deadlines+Tasks per day, from updated_at), not
 * a decorative fabrication.
 */
export function MomentumCard({ deadlines, tasks }: Props) {
  const now = new Date();
  // A deadline whose due_at has already passed but isn't (yet) marked
  // Overdue still sorts earliest by buildUpcomingItems — skip past-due items
  // so "focus hours remaining" only ever counts down to something actually
  // still ahead, matching SuggestionBanner's same future-only filter.
  const nearestDeadline = buildUpcomingItems({ deadlines, tasks: [] }).find((item) => item.at.getTime() > now.getTime());
  const hoursRemaining = nearestDeadline ? Math.round((nearestDeadline.at.getTime() - now.getTime()) / 3_600_000) : null;

  const trend = buildCompletionTrend(deadlines, tasks);
  const completedItems = buildCompletedThisWeek(deadlines, tasks);
  const max = Math.max(1, ...trend);
  const step = trend.length > 1 ? (SPARKLINE_WIDTH - SPARKLINE_PAD * 2) / (trend.length - 1) : 0;
  const points = trend
    .map((value, index) => {
      const x = SPARKLINE_PAD + index * step;
      const y = SPARKLINE_BASELINE - (value / max) * (SPARKLINE_BASELINE - SPARKLINE_TOP);
      return `${x},${y}`;
    })
    .join(" ");
  const completedThisWeek = trend.reduce((sum, value) => sum + value, 0);

  return (
    <GlassPanel className="flex flex-col gap-4 p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Momentum</p>

      {nearestDeadline ? (
        <div>
          <p className="font-display text-3xl font-semibold text-text-primary">
            {hoursRemaining}
            <span className="ml-1 text-base font-normal text-text-secondary">focus hrs left</span>
          </p>
          <Link href={nearestDeadline.href ?? "#"} className="text-xs text-text-secondary hover:text-accent-indigo hover:underline">
            until &quot;{nearestDeadline.title}&quot;
          </Link>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No hard deadlines on the horizon.</p>
      )}

      <div>
        <svg viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} aria-hidden="true" className="h-10 w-full">
          <polyline points={points} fill="none" className="stroke-accent-teal" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-1 font-mono text-xs text-text-secondary">{completedThisWeek} resolved this week</p>
      </div>

      {completedItems.length === 0 ? (
        <p className="text-xs text-text-secondary">Nothing resolved yet this week.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-panel-border">
          {completedItems.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col py-2 first:pt-0 last:pb-0">
              <Link href={item.href} className="truncate text-xs text-text-primary hover:underline">
                {item.title}
              </Link>
              <span className="font-mono text-[10px] text-text-secondary">
                {item.kind === "deadline" ? "Deadline" : "Task"} · {formatRelativeTime(item.at, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
