"use client";

import Link from "next/link";
import { Controller, useFieldArray, useFormContext, type FieldArrayPath, type FieldPath } from "react-hook-form";
import { DayOfWeekToggle } from "@/components/recurrence/DayOfWeekToggle";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useSettings } from "@/hooks/useSettings";
import type { RecurrenceFormFields } from "@/lib/calendar/recurrence";

const DEFAULT_NEW_BLOCK = { days: [] as number[], startMinutes: 9 * 60, endMinutes: 9 * 60 + 50 };

// react-hook-form's FieldErrors<T> can't distribute an index signature over
// meeting_blocks for a generic T the way it can for a concrete literal type
// (e.g. CoursePayload) — cast to this narrow shape instead of fighting the
// generic FieldErrors<T> inference at every call site below.
interface MeetingBlockFieldErrors {
  days?: { message?: string };
  endMinutes?: { message?: string };
}

function minutesToTimeInput(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

// Blank -> null so an optional date can be cleared, matching the
// emptyToUndefined pattern CourseForm already uses for its plain-text fields.
const emptyToNull = (value: string) => (value === "" ? null : value);

/**
 * Repeatable day+time-window blocks, plus the overall recurrence date range.
 * Generic over any form shape (CoursePayload, AppointmentPayload, ...) that
 * adopts the meeting_blocks/recurrence_start_date/recurrence_end_date field
 * names — pass the concrete type explicitly at the call site, e.g.
 * `<RecurrencePicker<CoursePayload> />`.
 */
export function RecurrencePicker<T extends RecurrenceFormFields>() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<T>();
  const { data: settings } = useSettings();
  const { fields, append, remove } = useFieldArray({ control, name: "meeting_blocks" as FieldArrayPath<T> });
  const meetingBlockErrors = errors.meeting_blocks as unknown as MeetingBlockFieldErrors[] | undefined;
  const recurrenceStartError = errors.recurrence_start_date as unknown as { message?: string } | undefined;
  const recurrenceEndError = errors.recurrence_end_date as unknown as { message?: string } | undefined;

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field, index) => (
        <GlassPanel key={field.id} className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
              01 / Active days{fields.length > 1 ? ` — window ${index + 1}` : ""}
            </p>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                Remove
              </Button>
            )}
          </div>
          <Controller
            control={control}
            name={`meeting_blocks.${index}.days` as FieldPath<T>}
            render={({ field: dayField }) => (
              <DayOfWeekToggle value={(dayField.value as number[] | undefined) ?? []} onChange={dayField.onChange} />
            )}
          />
          {meetingBlockErrors?.[index]?.days && (
            <p role="alert" className="text-xs text-status-urgent">
              {meetingBlockErrors[index]?.days?.message}
            </p>
          )}

          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">02 / Time window</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts" htmlFor={`meeting_blocks.${index}.startMinutes`}>
              <Controller
                control={control}
                name={`meeting_blocks.${index}.startMinutes` as FieldPath<T>}
                render={({ field: startField }) => (
                  <Input
                    id={`meeting_blocks.${index}.startMinutes`}
                    type="time"
                    value={minutesToTimeInput((startField.value as number | undefined) ?? 0)}
                    onChange={(event) => startField.onChange(timeInputToMinutes(event.target.value))}
                  />
                )}
              />
            </FormField>
            <FormField label="Ends" htmlFor={`meeting_blocks.${index}.endMinutes`} error={meetingBlockErrors?.[index]?.endMinutes?.message}>
              <Controller
                control={control}
                name={`meeting_blocks.${index}.endMinutes` as FieldPath<T>}
                render={({ field: endField }) => (
                  <Input
                    id={`meeting_blocks.${index}.endMinutes`}
                    type="time"
                    invalid={Boolean(meetingBlockErrors?.[index]?.endMinutes)}
                    value={minutesToTimeInput((endField.value as number | undefined) ?? 0)}
                    onChange={(event) => endField.onChange(timeInputToMinutes(event.target.value))}
                  />
                )}
              />
            </FormField>
          </div>
        </GlassPanel>
      ))}

      <Button type="button" variant="secondary" onClick={() => append(DEFAULT_NEW_BLOCK as never)}>
        + Add another time window
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Recurrence starts" htmlFor="recurrence_start_date" error={recurrenceStartError?.message}>
          <Input
            id="recurrence_start_date"
            type="date"
            invalid={Boolean(recurrenceStartError)}
            {...register("recurrence_start_date" as FieldPath<T>, { setValueAs: emptyToNull })}
          />
        </FormField>
        <FormField label="Recurrence ends" htmlFor="recurrence_end_date" error={recurrenceEndError?.message}>
          <Input
            id="recurrence_end_date"
            type="date"
            invalid={Boolean(recurrenceEndError)}
            {...register("recurrence_end_date" as FieldPath<T>, { setValueAs: emptyToNull })}
          />
        </FormField>
      </div>

      <p className="font-mono text-xs text-text-secondary">
        Times shown in {settings?.timezone ?? "your timezone"} —{" "}
        <Link href="/settings" className="text-accent-indigo hover:underline">
          change in Settings
        </Link>
        .
      </p>
    </div>
  );
}
