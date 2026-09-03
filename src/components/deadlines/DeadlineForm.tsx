"use client";

import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deadlinePayloadSchema, type DeadlinePayload } from "@/lib/api/schemas";
import type { DeadlineRow } from "@/lib/api/entity-types";
import { useCourses } from "@/hooks/useCourses";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Props = {
  deadline?: DeadlineRow;
  onSubmit: (values: DeadlinePayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

// priority is a nullable/optional enum — an untouched <select> reports ""
// (not undefined), which isn't a valid enum value. Normalize at submit time
// so leaving it on "Unset" actually omits the key.
const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

export function DeadlineForm({ deadline, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const { data: courses } = useCourses({ personId: "me" });
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DeadlinePayload>({
    resolver: zodResolver(deadlinePayloadSchema),
    defaultValues: {
      course_id: deadline?.course_id ?? "",
      title: deadline?.title ?? "",
      due_at: deadline?.due_at ?? "",
      priority: deadline?.priority ?? undefined,
    },
  });

  const courseId = watch("course_id");
  const selectedCourse = (courses?.rows ?? []).find((course) => course.id === courseId);

  return (
    <form onSubmit={handleSubmit(async (values) => onSubmit(values))} className="flex flex-col gap-4" noValidate>
      <FormField label="Course" htmlFor="course_id" error={errors.course_id?.message}>
        <Select
          id="course_id"
          invalid={Boolean(errors.course_id)}
          disabled={Boolean(deadline)}
          {...register("course_id")}
        >
          <option value="" disabled>
            Select a course
          </option>
          {(courses?.rows ?? []).map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </FormField>

      {selectedCourse && (
        <FormField label="Reminder">
          <div className="flex items-center gap-2">
            <Badge tone={selectedCourse.reminders_enabled ? "ok" : "neutral"}>
              {selectedCourse.reminders_enabled
                ? `${selectedCourse.reminder_lead_minutes}m before, via course`
                : "Reminders off, via course"}
            </Badge>
            <Link href={`/courses/${selectedCourse.id}`} className="text-xs text-text-secondary underline hover:text-text-primary">
              Edit on course
            </Link>
          </div>
        </FormField>
      )}

      <FormField label="Title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" invalid={Boolean(errors.title)} {...register("title")} />
      </FormField>

      <FormField label="Due" htmlFor="due_at" error={errors.due_at?.message}>
        <Controller
          control={control}
          name="due_at"
          render={({ field }) => (
            <DateTimeField
              id="due_at"
              value={field.value}
              onChange={(value) => field.onChange(value ?? "")}
              invalid={Boolean(errors.due_at)}
            />
          )}
        />
      </FormField>

      <FormField label="Priority" htmlFor="priority" error={errors.priority?.message}>
        <Select
          id="priority"
          invalid={Boolean(errors.priority)}
          {...register("priority", { setValueAs: emptyToUndefined })}
        >
          <option value="">Unset</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </Select>
      </FormField>

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
