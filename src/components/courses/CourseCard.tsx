"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { formatBlocksSummary } from "@/lib/calendar/recurrence";
import { formatLeadMinutes } from "@/lib/reminders/lead-time";
import type { CourseWorkloadPreview } from "@/lib/courses/course-workload";
import type { CourseRow } from "@/lib/api/entity-types";

type Props = {
  course: CourseRow;
  /** A tracked Person's name/hex color (People feature) — set for a tracked Person's course, or "Mine" plus the owner's chosen color for the account owner's own. Mirrors EventBlock's `color` prop on the calendar. */
  personName?: string;
  personColor?: string;
  /** Undefined while the roster's workload fetch is still loading — renders as a zero/neutral badge rather than nothing, so the card layout doesn't jump once it arrives. */
  preview?: CourseWorkloadPreview;
};

const EMPTY_PREVIEW: CourseWorkloadPreview = {
  pendingDeadlineCount: 0,
  openTaskCount: 0,
  overdueDeadlineCount: 0,
  urgencyTone: "neutral",
  nextDeadlines: [],
  openTasks: [],
};

export function CourseCard({ course, personName, personColor, preview = EMPTY_PREVIEW }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasPreviewItems = preview.nextDeadlines.length > 0 || preview.openTasks.length > 0;

  return (
    <GlassPanel
      className={`flex flex-col gap-2 p-4 ${personColor ? "border-l-[3px]" : ""}`}
      style={personColor ? { borderLeftColor: personColor } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/courses/${course.id}`} className="font-display text-base font-medium text-text-primary hover:underline">
          {course.name}
        </Link>
        {personName && (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-text-secondary">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: personColor }} />
            {personName}
          </span>
        )}
      </div>
      {(course.code || course.term) && (
        <p className="font-mono text-xs text-text-secondary">{[course.code, course.term].filter(Boolean).join(" · ")}</p>
      )}
      <p className="text-xs text-text-secondary">{formatBlocksSummary(course.meeting_blocks)}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={course.reminders_enabled ? "ok" : "neutral"}>
          {course.reminders_enabled ? `Reminders ${formatLeadMinutes(course.reminder_lead_minutes)} lead` : "Reminders off"}
        </Badge>
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} pending work for ${course.name}`}
          className="rounded-full outline-offset-2"
        >
          <Badge tone={preview.urgencyTone}>
            {preview.pendingDeadlineCount} deadlines · {preview.openTaskCount} tasks
          </Badge>
        </button>
        <Link href={`/courses/${course.id}`} className="ml-auto text-xs text-accent-indigo hover:underline">
          View course
        </Link>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-1.5 border-t border-panel-border pt-2">
          {hasPreviewItems ? (
            <>
              {preview.nextDeadlines.map((deadline) => (
                <Link
                  key={deadline.id}
                  href={`/courses/deadlines/${deadline.id}`}
                  className="flex items-baseline justify-between gap-2 text-xs text-text-secondary hover:text-text-primary hover:underline"
                >
                  <span className="truncate">{deadline.title}</span>
                  <span className="shrink-0 font-mono">{new Date(deadline.due_at).toLocaleDateString()}</span>
                </Link>
              ))}
              {preview.openTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/board/${task.id}`}
                  className="truncate text-xs text-text-secondary hover:text-text-primary hover:underline"
                >
                  {task.title}
                </Link>
              ))}
            </>
          ) : (
            <p className="text-xs text-text-secondary">Nothing pending.</p>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
