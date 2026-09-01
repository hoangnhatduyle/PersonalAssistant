"use client";

import { useState } from "react";
import { useCourses, useCreateCourse } from "@/hooks/useCourses";
import { CourseList } from "@/components/courses/CourseList";
import { CourseForm } from "@/components/courses/CourseForm";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { CoursePayload } from "@/lib/api/schemas";

export function CourseListContainer() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const { showToast } = useToast();

  const handleCreate = async (values: CoursePayload) => {
    try {
      await createCourse.mutateAsync(values);
      showToast("Course created", "success");
      setCreateOpen(false);
    } catch {
      showToast("Could not create course", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Courses</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">Course roster</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New course</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <CourseList courses={data?.rows ?? []} />
      )}

      <Dialog open={isCreateOpen} onClose={() => setCreateOpen(false)} title="New course" size="xl">
        <CourseForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} submitLabel="Create course" />
      </Dialog>
    </div>
  );
}
