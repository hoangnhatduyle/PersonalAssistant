import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { formatBlocksSummary } from "@/lib/calendar/recurrence";
import type { CourseRow } from "@/lib/api/entity-types";

type Props = {
  course: CourseRow;
  /** A tracked Person's name/hex color (People feature) — set only when the course isn't the account owner's own. Mirrors EventBlock's `color` prop on the calendar. */
  personName?: string;
  personColor?: string;
};

export function CourseCard({ course, personName, personColor }: Props) {
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
      <Badge tone={course.reminders_enabled ? "ok" : "neutral"}>
        {course.reminders_enabled ? `Reminders ${course.reminder_lead_minutes}m lead` : "Reminders off"}
      </Badge>
    </GlassPanel>
  );
}
