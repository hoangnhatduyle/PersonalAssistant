"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { coursePayloadSchema, type CoursePayload } from "@/lib/api/schemas";
import type { CourseRow } from "@/lib/api/entity-types";
import { usePeople } from "@/hooks/usePeople";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

type Props = {
  course?: CourseRow;
  onSubmit: (values: CoursePayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

// coursePayloadSchema's optional text fields are `.min(1).optional()` — an
// omitted key is valid, but a plain uncontrolled input reports an untouched
// field as "" (not undefined), which fails that min(1) check. Normalize "" to
// undefined at submit time so leaving an optional field blank actually omits it.
const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

export function CourseForm({ course, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const { data: people } = usePeople();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CoursePayload>({
    resolver: zodResolver(coursePayloadSchema),
    defaultValues: {
      code: course?.code ?? undefined,
      name: course?.name ?? "",
      term: course?.term ?? undefined,
      meeting_pattern: course?.meeting_pattern ?? undefined,
      location: course?.location ?? undefined,
      instructor: course?.instructor ?? undefined,
      reminders_enabled: course?.reminders_enabled ?? true,
      reminder_lead_minutes: course?.reminder_lead_minutes ?? 60,
      person_id: course?.person_id ?? undefined,
    },
  });

  return (
    <form onSubmit={handleSubmit(async (values) => onSubmit(values))} className="flex flex-col gap-4" noValidate>
      <FormField label="Name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" invalid={Boolean(errors.name)} {...register("name")} />
      </FormField>

      <FormField label="For" htmlFor="person_id" error={errors.person_id?.message}>
        <Select id="person_id" invalid={Boolean(errors.person_id)} {...register("person_id", { setValueAs: emptyToUndefined })}>
          <option value="">Me</option>
          {(people?.rows ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Code" htmlFor="code" error={errors.code?.message}>
          <Input id="code" invalid={Boolean(errors.code)} {...register("code", { setValueAs: emptyToUndefined })} />
        </FormField>
        <FormField label="Term" htmlFor="term" error={errors.term?.message}>
          <Input id="term" invalid={Boolean(errors.term)} {...register("term", { setValueAs: emptyToUndefined })} />
        </FormField>
      </div>

      <FormField label="Meeting pattern" htmlFor="meeting_pattern" error={errors.meeting_pattern?.message}>
        <Input
          id="meeting_pattern"
          placeholder="e.g. MWF 10:00-10:50"
          invalid={Boolean(errors.meeting_pattern)}
          {...register("meeting_pattern", { setValueAs: emptyToUndefined })}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Location" htmlFor="location" error={errors.location?.message}>
          <Input id="location" invalid={Boolean(errors.location)} {...register("location", { setValueAs: emptyToUndefined })} />
        </FormField>
        <FormField label="Instructor" htmlFor="instructor" error={errors.instructor?.message}>
          <Input
            id="instructor"
            invalid={Boolean(errors.instructor)}
            {...register("instructor", { setValueAs: emptyToUndefined })}
          />
        </FormField>
      </div>

      <Checkbox label="Reminders enabled" {...register("reminders_enabled")} />

      <FormField label="Reminder lead (minutes)" htmlFor="reminder_lead_minutes" error={errors.reminder_lead_minutes?.message}>
        <Input
          id="reminder_lead_minutes"
          type="number"
          min={0}
          invalid={Boolean(errors.reminder_lead_minutes)}
          {...register("reminder_lead_minutes", { valueAsNumber: true })}
        />
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
