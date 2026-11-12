"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { libraryRecommenderPayloadSchema, type LibraryRecommenderFormInput, type LibraryRecommenderPayload } from "@/lib/api/library-schemas";
import type { LibraryRecommender } from "@/lib/api/entity-types";
import { RECOMMENDER_STATUSES } from "@/lib/library/constants";
import { RECOMMENDER_STATUS_LABEL } from "@/lib/library/labels";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  recommender?: LibraryRecommender;
  onSubmit: (values: LibraryRecommenderPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function RecommenderForm({ recommender, onSubmit, onCancel, submitLabel = "Save recommender" }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LibraryRecommenderFormInput, unknown, LibraryRecommenderPayload>({
    resolver: zodResolver(libraryRecommenderPayloadSchema),
    defaultValues: {
      name: recommender?.name ?? "",
      affiliation: recommender?.affiliation ?? "",
      email: recommender?.email ?? "",
      relationship: recommender?.relationship ?? "",
      status: recommender?.status ?? "potential",
      notes: recommender?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save the recommender");
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Name" htmlFor="recommender-name" error={errors.name?.message}>
        <Input id="recommender-name" placeholder="Dr. Jane Smith" invalid={Boolean(errors.name)} {...register("name")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title / affiliation" htmlFor="recommender-affiliation">
          <Input id="recommender-affiliation" placeholder="Professor, University of Colorado" {...register("affiliation")} />
        </FormField>
        <FormField label="Relationship" htmlFor="recommender-relationship">
          <Input id="recommender-relationship" placeholder="Advisor, course instructor, manager…" {...register("relationship")} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email" htmlFor="recommender-email">
          <Input id="recommender-email" type="email" placeholder="name@example.edu" {...register("email")} />
        </FormField>
        <FormField label="Willingness" htmlFor="recommender-status">
          <Select id="recommender-status" {...register("status")}>
            {RECOMMENDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RECOMMENDER_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="recommender-notes" error={errors.notes?.message}>
        <Textarea id="recommender-notes" rows={3} placeholder="What they know you for, what to send them…" {...register("notes")} />
      </FormField>

      {formError && (
        <p role="alert" className="text-sm text-status-urgent">
          {formError}
        </p>
      )}

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
