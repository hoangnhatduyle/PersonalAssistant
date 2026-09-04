import { EmptyState } from "@/components/ui/EmptyState";
import { DeadlineCard } from "@/components/deadlines/DeadlineCard";
import type { DeadlineRow } from "@/lib/api/entity-types";
import type { SessionProgress } from "@/lib/deadlines/session-progress";

type Props = {
  deadlines: DeadlineRow[];
  courseNameById?: Map<string, string>;
  sessionProgressByDeadlineId?: Map<string, SessionProgress>;
};

export function DeadlineList({ deadlines, courseNameById, sessionProgressByDeadlineId }: Props) {
  if (deadlines.length === 0) {
    return <EmptyState title="No deadlines yet" description="Add a deadline under a course to see it here." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {deadlines.map((deadline) => (
        <DeadlineCard
          key={deadline.id}
          deadline={deadline}
          courseName={courseNameById?.get(deadline.course_id)}
          sessionProgress={sessionProgressByDeadlineId?.get(deadline.id)}
        />
      ))}
    </div>
  );
}
