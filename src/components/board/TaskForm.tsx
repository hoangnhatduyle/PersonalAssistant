"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskPayloadSchema, type TaskPayload } from "@/lib/api/schemas";
import type { TaskWithLabels } from "@/lib/api/entity-types";
import { usePeople } from "@/hooks/usePeople";
import { useTodoLists } from "@/hooks/useTodoLists";
import { useLabels } from "@/hooks/useLabels";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { LabelChip } from "@/components/ui/LabelChip";
import { LabelsPopover } from "@/components/board/LabelsPopover";

type Props = {
  task?: TaskWithLabels;
  /** Pre-selects a Board List when creating a card from within a column (e.g. BoardColumn's "+ Add card"). Ignored when editing an existing card. */
  defaultListId?: string | null;
  onSubmit: (values: TaskPayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

// person_id/priority are nullable/optional (uuid / enum respectively) — a
// native <select>'s empty sentinel option ("Me" / "Unset") reports "" (not
// undefined), which fails those checks. Normalize at submit time so the
// sentinel actually omits the key.
const emptyToUndefined = (value: string) => (value === "" ? undefined : value);
// list_id, unlike person_id/priority above, must support being explicitly
// cleared back to "Unsorted" on an edit (taskPatchSchema accepts a real
// null for it) — undefined would just omit the key and leave the existing
// list_id untouched.
const emptyToNull = (value: string) => (value === "" ? null : value);

export function TaskForm({
  task,
  defaultListId,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: Props) {
  const { data: people } = usePeople();
  const { data: todoLists } = useTodoLists({ limit: 100 });
  const { data: labels } = useLabels();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaskPayload>({
    resolver: zodResolver(taskPayloadSchema),
    defaultValues: {
      title: task?.title ?? "",
      due_at: task?.due_at ?? null,
      reminders_enabled: task?.reminders_enabled ?? true,
      reminder_lead_minutes: task?.reminder_lead_minutes ?? 30,
      person_id: task?.person_id ?? undefined,
      priority: task?.priority ?? undefined,
      list_id: task ? task.list_id : (defaultListId ?? null),
      label_ids: task?.task_labels.map(({ label }) => label.id) ?? [],
    },
  });

  const remindersEnabled = watch("reminders_enabled");
  const labelIds = watch("label_ids") ?? [];
  const labelById = new Map((labels?.rows ?? []).map((label) => [label.id, label]));

  const toggleLabel = (labelId: string) => {
    setValue(
      "label_ids",
      labelIds.includes(labelId) ? labelIds.filter((id) => id !== labelId) : [...labelIds, labelId],
      { shouldDirty: true },
    );
  };

  return (
    <form
      onSubmit={handleSubmit(async (values) => onSubmit(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormField label="Title" htmlFor="title" error={errors.title?.message}>
        <Input
          id="title"
          invalid={Boolean(errors.title)}
          {...register("title")}
        />
      </FormField>

      <FormField
        label="Board List"
        htmlFor="list_id"
        error={errors.list_id?.message}
      >
        <Select
          id="list_id"
          invalid={Boolean(errors.list_id)}
          {...register("list_id", { setValueAs: emptyToNull })}
        >
          <option value="">Unsorted</option>
          {(todoLists?.rows ?? []).map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="For"
        htmlFor="person_id"
        error={errors.person_id?.message}
      >
        <Select
          id="person_id"
          invalid={Boolean(errors.person_id)}
          {...register("person_id", { setValueAs: emptyToUndefined })}
        >
          <option value="">Me</option>
          {(people?.rows ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Due" htmlFor="due_at" error={errors.due_at?.message}>
        <Controller
          control={control}
          name="due_at"
          render={({ field }) => (
            <DateTimeField
              id="due_at"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.due_at)}
            />
          )}
        />
      </FormField>

      <FormField
        label="Priority"
        htmlFor="priority"
        error={errors.priority?.message}
      >
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

      <FormField label="Labels">
        <div className="flex flex-wrap items-center gap-1.5">
          {labelIds.map((labelId) => {
            const label = labelById.get(labelId);
            if (!label) return null;
            return (
              <LabelChip key={labelId} color={label.color}>
                {label.name}
                <button
                  type="button"
                  aria-label={`Remove label ${label.name}`}
                  onClick={() => toggleLabel(labelId)}
                  className="ml-1"
                >
                  ×
                </button>
              </LabelChip>
            );
          })}
          <LabelsPopover selectedLabelIds={labelIds} onToggleLabel={toggleLabel} />
        </div>
      </FormField>

      <Checkbox label="Reminders enabled" {...register("reminders_enabled")} />

      {remindersEnabled && (
        <FormField
          label="Reminder lead (minutes)"
          htmlFor="reminder_lead_minutes"
          error={errors.reminder_lead_minutes?.message}
        >
          <Input
            id="reminder_lead_minutes"
            type="number"
            min={0}
            invalid={Boolean(errors.reminder_lead_minutes)}
            {...register("reminder_lead_minutes", { valueAsNumber: true })}
          />
        </FormField>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
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
