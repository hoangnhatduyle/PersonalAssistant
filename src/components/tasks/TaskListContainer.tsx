"use client";

import { useState } from "react";
import { useCreateTask, useTasks } from "@/hooks/useTasks";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { TaskPayload } from "@/lib/api/schemas";

export function TaskListContainer() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useTasks();
  const createTask = useCreateTask();
  const { showToast } = useToast();

  const handleCreate = async (values: TaskPayload) => {
    try {
      await createTask.mutateAsync(values);
      showToast("Task created", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not create task", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Tasks</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Open loops</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New task</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <TaskList tasks={data?.rows ?? []} />
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="New task">
        <TaskForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Create task" />
      </Dialog>
    </div>
  );
}
