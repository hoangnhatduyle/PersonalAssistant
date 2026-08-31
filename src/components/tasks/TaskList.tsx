import { EmptyState } from "@/components/ui/EmptyState";
import { TaskCard } from "@/components/tasks/TaskCard";
import type { TaskRow } from "@/lib/api/entity-types";

type Props = {
  tasks: TaskRow[];
};

export function TaskList({ tasks }: Props) {
  if (tasks.length === 0) {
    return <EmptyState title="No tasks yet" description="Capture a task to see it here." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
