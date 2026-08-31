import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import type { CourseRow } from "@/lib/api/entity-types";

type Props = {
  course: CourseRow;
};

export function CourseCard({ course }: Props) {
  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <Link href={`/courses/${course.id}`} className="font-display text-base font-medium text-text-primary hover:underline">
        {course.name}
      </Link>
      {(course.code || course.term) && (
        <p className="font-mono text-xs text-text-secondary">{[course.code, course.term].filter(Boolean).join(" · ")}</p>
      )}
      {course.meeting_pattern && <p className="text-xs text-text-secondary">{course.meeting_pattern}</p>}
      <Badge tone={course.reminders_enabled ? "ok" : "neutral"}>
        {course.reminders_enabled ? `Reminders ${course.reminder_lead_minutes}m lead` : "Reminders off"}
      </Badge>
    </GlassPanel>
  );
}
