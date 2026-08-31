"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskPayloadSchema, type TaskPayload } from "@/lib/api/schemas";
import type { TaskRow } from "@/lib/api/entity-types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Props = {
  task?: TaskRow;
  onSubmit: (values: TaskPayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

export function TaskForm({ task, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const [tagDraft, setTagDraft] = useState("");
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
      tags: task?.tags ?? [],
      reminders_enabled: task?.reminders_enabled ?? true,
      reminder_lead_minutes: task?.reminder_lead_minutes ?? 30,
    },
  });

  const tags = watch("tags") ?? [];

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || tags.includes(value)) {
      setTagDraft("");
      return;
    }
    setValue("tags", [...tags, value], { shouldDirty: true });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    setValue(
      "tags",
      tags.filter((current) => current !== tag),
      { shouldDirty: true },
    );
  };

  return (
    <form onSubmit={handleSubmit(async (values) => onSubmit(values))} className="flex flex-col gap-4" noValidate>
      <FormField label="Title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" invalid={Boolean(errors.title)} {...register("title")} />
      </FormField>

      <FormField label="Due" htmlFor="due_at" error={errors.due_at?.message}>
        <Controller
          control={control}
          name="due_at"
          render={({ field }) => (
            <DateTimeField id="due_at" value={field.value} onChange={field.onChange} invalid={Boolean(errors.due_at)} />
          )}
        />
      </FormField>

      <FormField label="Tags" htmlFor="tag-draft">
        <div className="flex gap-2">
          <Input
            id="tag-draft"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag and press Enter"
          />
          <Button type="button" variant="secondary" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
                <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)} className="ml-1">
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
      </FormField>

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
