import { EmptyState } from "@/components/ui/EmptyState";
import { DeadlineCard } from "@/components/deadlines/DeadlineCard";
import type { DeadlineRow } from "@/lib/api/entity-types";
import type { SessionProgress } from "@/lib/deadlines/session-progress";

type Props = {
  deadlines: DeadlineRow[];
  courseNameById?: Map<string, string>;
  sessionProgressByDeadlineId?: Map<string, SessionProgress>;
};

const UNASSIGNED_LABEL = "No course";

function groupByCourse(deadlines: DeadlineRow[], courseNameById?: Map<string, string>) {
  const groups = new Map<string, { courseName: string; deadlines: DeadlineRow[] }>();
  for (const deadline of deadlines) {
    const courseName = courseNameById?.get(deadline.course_id) ?? UNASSIGNED_LABEL;
    const group = groups.get(deadline.course_id);
    if (group) {
      group.deadlines.push(deadline);
    } else {
      groups.set(deadline.course_id, { courseName, deadlines: [deadline] });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.courseName === UNASSIGNED_LABEL) return 1;
    if (b.courseName === UNASSIGNED_LABEL) return -1;
    return a.courseName.localeCompare(b.courseName);
  });
}

export function DeadlineList({ deadlines, courseNameById, sessionProgressByDeadlineId }: Props) {
  if (deadlines.length === 0) {
    return <EmptyState title="No deadlines yet" description="Add a deadline under a course to see it here." />;
  }
  const groups = groupByCourse(deadlines, courseNameById);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, index) => (
        <div
          key={group.courseName}
          className={`flex flex-col gap-3 ${index > 0 ? "border-t border-panel-border pt-6" : ""}`}
        >
          <h2 className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">{group.courseName}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.deadlines.map((deadline) => (
              <DeadlineCard
                key={deadline.id}
                deadline={deadline}
                courseName={undefined}
                sessionProgress={sessionProgressByDeadlineId?.get(deadline.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
