"use client";

import { useMemo, useState } from "react";
import { useCreateDeadline, useDeadlines } from "@/hooks/useDeadlines";
import { useCourses } from "@/hooks/useCourses";
import { useAppointments } from "@/hooks/useAppointments";
import { DeadlineList } from "@/components/deadlines/DeadlineList";
import { DeadlineForm } from "@/components/deadlines/DeadlineForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { buildSessionProgress } from "@/lib/deadlines/session-progress";
import type { DeadlinePayload } from "@/lib/api/schemas";

export function DeadlineListContainer() {
  const [courseFilter, setCourseFilter] = useState("");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const { data: courses } = useCourses();
  const { data, isLoading } = useDeadlines(courseFilter ? { courseId: courseFilter } : undefined);
  // limit reuses AppointmentsTimeline's existing cap — a known v1 scaling
  // limitation (a user with 100+ live appointments loses card-level progress
  // for sessions past that page), not a blocker for this feature.
  const { data: appointments } = useAppointments({ limit: 100 });
  const createDeadline = useCreateDeadline();
  const { showToast } = useToast();

  const courseNameById = useMemo(() => new Map((courses?.rows ?? []).map((course) => [course.id, course.name])), [courses]);
  const sessionProgressByDeadlineId = useMemo(
    () => new Map(buildSessionProgress(appointments?.rows ?? []).map((progress) => [progress.deadlineId, progress])),
    [appointments],
  );

  const handleCreate = async (values: DeadlinePayload) => {
    try {
      await createDeadline.mutateAsync(values);
      showToast("Deadline created", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not create deadline", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Deadlines</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Due dates</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="w-48">
            <option value="">All courses</option>
            {(courses?.rows ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 whitespace-nowrap">
            New deadline
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <DeadlineList deadlines={data?.rows ?? []} courseNameById={courseNameById} sessionProgressByDeadlineId={sessionProgressByDeadlineId} />
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="New deadline">
        <DeadlineForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Create deadline" />
      </Dialog>
    </div>
  );
}
