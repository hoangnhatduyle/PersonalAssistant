"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { personPayloadSchema, type PersonPayload } from "@/lib/api/schemas";
import type { PersonRow } from "@/lib/api/entity-types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// personPayloadSchema's relationship field is a transform (empty-string ->
// null), so its input shape (what the form fields hold before submit) and
// output shape (PersonPayload, what onSubmit receives) diverge -- react-hook-
// form's 3-generic useForm<Input, Context, Output> keeps defaultValues typed
// against the pre-transform input while handleSubmit's callback still gets
// the post-transform PersonPayload.
type PersonFormValues = z.input<typeof personPayloadSchema>;

type Props = {
  person?: PersonRow;
  /** How many people already exist — picks the next default swatch so successive "Add person" clicks don't collide. */
  existingCount?: number;
  onSubmit: (values: PersonPayload) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
};

// A small rotating palette of distinct, legible hues — cycled by index so
// each new person gets a different default color instead of everyone
// starting on the DB's single default ('#6366f1').
const DEFAULT_COLOR_PALETTE = ["#6366f1", "#ec4899", "#22c55e", "#f97316", "#0ea5e9", "#a855f7", "#eab308", "#14b8a6"];

export function PersonForm({ person, existingCount = 0, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const defaultColor = person?.color ?? DEFAULT_COLOR_PALETTE[existingCount % DEFAULT_COLOR_PALETTE.length];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonFormValues, unknown, PersonPayload>({
    resolver: zodResolver(personPayloadSchema),
    defaultValues: {
      name: person?.name ?? "",
      color: defaultColor,
      relationship: person?.relationship ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(async (values) => onSubmit(values))} className="flex flex-col gap-4" noValidate>
      <FormField label="Name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" placeholder="e.g. Chau" invalid={Boolean(errors.name)} {...register("name")} />
      </FormField>

      <FormField label="Relationship" htmlFor="relationship" error={errors.relationship?.message}>
        <Input
          id="relationship"
          placeholder="e.g. sister, roommate, coworker"
          invalid={Boolean(errors.relationship)}
          {...register("relationship")}
        />
      </FormField>

      <FormField label="Color" htmlFor="color" error={errors.color?.message}>
        <input
          id="color"
          type="color"
          className="h-10 w-16 cursor-pointer rounded-control border border-panel-border bg-bg-void-elevated p-1"
          {...register("color")}
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
