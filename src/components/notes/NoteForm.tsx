"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { notePayloadSchema, type NotePayload } from "@/lib/api/schemas";
import type { NoteRow } from "@/lib/api/entity-types";
import { useCourses } from "@/hooks/useCourses";
import { useTasks } from "@/hooks/useTasks";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Props = {
  note?: NoteRow;
  onSubmit: (values: NotePayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

const emptyToNull = (value: string) => (value === "" ? null : value);

export function NoteForm({ note, onSubmit, onCancel, submitLabel = "Save note" }: Props) {
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NotePayload>({
    resolver: zodResolver(notePayloadSchema),
    defaultValues: {
      body: note?.body ?? "",
      linked_course_id: note?.linked_course_id ?? "",
      linked_task_id: note?.linked_task_id ?? "",
      linked_date: note?.linked_date ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(async (values) => onSubmit(values))} className="flex flex-col gap-4" noValidate>
      <FormField label="Note" htmlFor="body" error={errors.body?.message}>
        <Textarea id="body" rows={3} invalid={Boolean(errors.body)} {...register("body")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Course" htmlFor="linked_course_id">
          <Select id="linked_course_id" {...register("linked_course_id", { setValueAs: emptyToNull })}>
            <option value="">None</option>
            {(courses?.rows ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Task" htmlFor="linked_task_id">
          <Select id="linked_task_id" {...register("linked_task_id", { setValueAs: emptyToNull })}>
            <option value="">None</option>
            {(tasks?.rows ?? []).map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Date" htmlFor="linked_date">
          <Input id="linked_date" type="date" {...register("linked_date", { setValueAs: emptyToNull })} />
        </FormField>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
