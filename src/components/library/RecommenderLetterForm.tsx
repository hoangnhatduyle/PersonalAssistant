"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  libraryRecommenderLetterPayloadSchema,
  type LibraryRecommenderLetterFormInput,
  type LibraryRecommenderLetterPayload,
} from "@/lib/api/library-schemas";
import type { LibraryRecommenderLetter } from "@/lib/api/entity-types";
import { LETTER_STATUSES } from "@/lib/library/constants";
import { LETTER_STATUS_LABEL } from "@/lib/library/labels";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  letter?: LibraryRecommenderLetter;
  onSubmit: (values: LibraryRecommenderLetterPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

/** One recommendation letter: what it's for, where it stands, and when it was asked for / received. */
export function RecommenderLetterForm({ letter, onSubmit, onCancel, submitLabel = "Save letter" }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LibraryRecommenderLetterFormInput, unknown, LibraryRecommenderLetterPayload>({
    resolver: zodResolver(libraryRecommenderLetterPayloadSchema),
    defaultValues: {
      purpose: letter?.purpose ?? "",
      status: letter?.status ?? "received",
      requested_on: letter?.requested_on ?? "",
      received_on: letter?.received_on ?? "",
      notes: letter?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save the letter");
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Letter for" htmlFor="letter-purpose" error={errors.purpose?.message}>
        <Input id="letter-purpose" placeholder="Siemens, PhD applications, internship…" invalid={Boolean(errors.purpose)} {...register("purpose")} />
      </FormField>

      <FormField label="Status" htmlFor="letter-status">
        <Select id="letter-status" {...register("status")}>
          {LETTER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LETTER_STATUS_LABEL[status]}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Asked on" htmlFor="letter-requested" error={errors.requested_on?.message}>
          <Input id="letter-requested" type="date" {...register("requested_on")} />
        </FormField>
        <FormField label="Received on" htmlFor="letter-received" error={errors.received_on?.message}>
          <Input id="letter-received" type="date" {...register("received_on")} />
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="letter-notes" error={errors.notes?.message}>
        <Textarea id="letter-notes" rows={3} placeholder="Where it was sent, whether it's reusable…" {...register("notes")} />
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
