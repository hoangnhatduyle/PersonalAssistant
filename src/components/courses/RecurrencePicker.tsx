"use client";

import Link from "next/link";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { DayOfWeekToggle } from "@/components/courses/DayOfWeekToggle";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useSettings } from "@/hooks/useSettings";
import type { CoursePayload } from "@/lib/api/schemas";

const DEFAULT_NEW_BLOCK = { days: [] as number[], startMinutes: 9 * 60, endMinutes: 9 * 60 + 50 };

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

/** Structured replacement for the old free-text meeting_pattern field: repeatable day+time-window blocks, plus the overall recurrence date range. */
export function RecurrencePicker() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<CoursePayload>();
  const { data: settings } = useSettings();
  const { fields, append, remove } = useFieldArray({ control, name: "meeting_blocks" });

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
            name={`meeting_blocks.${index}.days`}
            render={({ field: dayField }) => <DayOfWeekToggle value={dayField.value ?? []} onChange={dayField.onChange} />}
          />
          {errors.meeting_blocks?.[index]?.days && (
            <p role="alert" className="text-xs text-status-urgent">
              {errors.meeting_blocks[index]?.days?.message as string}
            </p>
          )}

          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">02 / Time window</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts" htmlFor={`meeting_blocks.${index}.startMinutes`}>
              <Controller
                control={control}
                name={`meeting_blocks.${index}.startMinutes`}
                render={({ field: startField }) => (
                  <Input
                    id={`meeting_blocks.${index}.startMinutes`}
                    type="time"
                    value={minutesToTimeInput(startField.value ?? 0)}
                    onChange={(event) => startField.onChange(timeInputToMinutes(event.target.value))}
                  />
                )}
              />
            </FormField>
            <FormField label="Ends" htmlFor={`meeting_blocks.${index}.endMinutes`} error={errors.meeting_blocks?.[index]?.endMinutes?.message}>
              <Controller
                control={control}
                name={`meeting_blocks.${index}.endMinutes`}
                render={({ field: endField }) => (
                  <Input
                    id={`meeting_blocks.${index}.endMinutes`}
                    type="time"
                    invalid={Boolean(errors.meeting_blocks?.[index]?.endMinutes)}
                    value={minutesToTimeInput(endField.value ?? 0)}
                    onChange={(event) => endField.onChange(timeInputToMinutes(event.target.value))}
                  />
                )}
              />
            </FormField>
          </div>
        </GlassPanel>
      ))}

      <Button type="button" variant="secondary" onClick={() => append(DEFAULT_NEW_BLOCK)}>
        + Add another time window
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Recurrence starts" htmlFor="recurrence_start_date" error={errors.recurrence_start_date?.message}>
          <Input
            id="recurrence_start_date"
            type="date"
            invalid={Boolean(errors.recurrence_start_date)}
            {...register("recurrence_start_date", { setValueAs: emptyToNull })}
          />
        </FormField>
        <FormField label="Recurrence ends" htmlFor="recurrence_end_date" error={errors.recurrence_end_date?.message}>
          <Input
            id="recurrence_end_date"
            type="date"
            invalid={Boolean(errors.recurrence_end_date)}
            {...register("recurrence_end_date", { setValueAs: emptyToNull })}
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
