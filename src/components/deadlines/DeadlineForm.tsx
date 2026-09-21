"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/Checkbox";
import { DayOfWeekToggle } from "@/components/recurrence/DayOfWeekToggle";
import { formatLeadMinutes } from "@/lib/reminders/lead-time";

type Props = {
  deadline?: DeadlineRow;
  /** Pre-fills the due date/time when creating from a Calendar empty-slot click (src/components/calendar/CreateEventDialog.tsx). Ignored when editing an existing deadline. */
  defaultDueAt?: string;
  onSubmit: (values: DeadlinePayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

// priority is a nullable/optional enum — an untouched <select> reports ""
// (not undefined), which isn't a valid enum value. Normalize at submit time
// so leaving it on "Unset" actually omits the key.
const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

// Blank -> null so the optional end date can be cleared (same pattern as RecurrencePicker's emptyToNull).
const emptyToNull = (value: string) => (value === "" ? null : value);

/** Browser-local weekday (0=Sunday..6=Saturday) of an ISO due_at, used to preselect the day when "Repeat weekly" is first checked. */
function weekdayOf(dueAt: string): number | null {
  const date = new Date(dueAt);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

export function DeadlineForm({ deadline, defaultDueAt, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const { data: courses } = useCourses({ personId: "me" });
  const [isRecurring, setIsRecurring] = useState(() => (deadline?.recurrence_days?.length ?? 0) > 0);
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<DeadlinePayload>({
    resolver: zodResolver(deadlinePayloadSchema),
    defaultValues: {
      course_id: deadline?.course_id ?? "",
      title: deadline?.title ?? "",
      due_at: deadline?.due_at ?? defaultDueAt ?? "",
      priority: deadline?.priority ?? undefined,
      recurrence_days: deadline?.recurrence_days ?? [],
      recurrence_end_date: deadline?.recurrence_end_date ?? null,
    },
  });

  const handleRecurringChange = (checked: boolean) => {
    setIsRecurring(checked);
    clearErrors("recurrence_days");
    if (checked && (getValues("recurrence_days") ?? []).length === 0) {
      const weekday = weekdayOf(getValues("due_at"));
      if (weekday !== null) setValue("recurrence_days", [weekday]);
    }
  };

  // A one-off deadline always submits an empty rule (not an omitted one) so
  // un-checking "Repeat weekly" while editing actually clears a stored series.
  const submit = async (values: DeadlinePayload) => {
    if (!isRecurring) {
      await onSubmit({ ...values, recurrence_days: [], recurrence_end_date: null });
      return;
    }
    if ((values.recurrence_days ?? []).length === 0) {
      setError("recurrence_days", { message: "Pick at least one day" });
      return;
    }
    await onSubmit(values);
  };

  const courseId = watch("course_id");
  const selectedCourse = (courses?.rows ?? []).find((course) => course.id === courseId);

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
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
                ? `${formatLeadMinutes(selectedCourse.reminder_lead_minutes)} before, via course`
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

      <Checkbox label="Repeat weekly" checked={isRecurring} onChange={(event) => handleRecurringChange(event.target.checked)} />

      {isRecurring && (
        <div className="flex flex-col gap-4 rounded-control border border-panel-border p-4">
          <FormField label="Repeats on" error={errors.recurrence_days?.message}>
            <Controller
              control={control}
              name="recurrence_days"
              render={({ field }) => (
                <DayOfWeekToggle
                  value={field.value ?? []}
                  onChange={(days) => {
                    clearErrors("recurrence_days");
                    field.onChange(days);
                  }}
                />
              )}
            />
          </FormField>
          <FormField label="Repeat until (optional)" htmlFor="recurrence_end_date" error={errors.recurrence_end_date?.message}>
            <Input
              id="recurrence_end_date"
              type="date"
              invalid={Boolean(errors.recurrence_end_date)}
              {...register("recurrence_end_date", { setValueAs: emptyToNull })}
            />
          </FormField>
          <p className="font-mono text-xs text-text-secondary">
            Each occurrence is its own deadline. The next one, due at the same time on the next selected day, is created when this one is completed, cancelled, or comes due.
          </p>
        </div>
      )}

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
