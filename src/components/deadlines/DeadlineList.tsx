import { EmptyState } from "@/components/ui/EmptyState";
import { DeadlineCard } from "@/components/deadlines/DeadlineCard";
import type { DeadlineRow } from "@/lib/api/entity-types";

type Props = {
  deadlines: DeadlineRow[];
  courseNameById?: Map<string, string>;
};

export function DeadlineList({ deadlines, courseNameById }: Props) {
  if (deadlines.length === 0) {
    return <EmptyState title="No deadlines yet" description="Add a deadline under a course to see it here." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {deadlines.map((deadline) => (
        <DeadlineCard key={deadline.id} deadline={deadline} courseName={courseNameById?.get(deadline.course_id)} />
      ))}
    </div>
  );
}
