"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { libraryEmployerPayloadSchema, type LibraryEmployerFormInput, type LibraryEmployerPayload } from "@/lib/api/library-schemas";
import type { LibraryEmployer } from "@/lib/api/entity-types";
import { ApiError } from "@/lib/http/client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  employer?: Pick<LibraryEmployer, "name" | "website" | "careers_url" | "notes">;
  /** Rejects with an ApiError on failure — this form renders the 409 "name taken" and generic messages itself. */
  onSubmit: (values: LibraryEmployerPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function EmployerForm({ employer, onSubmit, onCancel, submitLabel = "Save employer" }: Props) {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LibraryEmployerFormInput, unknown, LibraryEmployerPayload>({
    resolver: zodResolver(libraryEmployerPayloadSchema),
    defaultValues: {
      name: employer?.name ?? "",
      website: employer?.website ?? "",
      careers_url: employer?.careers_url ?? "",
      notes: employer?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setDuplicateId(null);
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setDuplicateId((error.data as { existing_id?: string | null } | null)?.existing_id ?? "");
      } else {
        setFormError(error instanceof Error ? error.message : "Could not save the employer");
      }
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Name" htmlFor="employer-name" error={errors.name?.message}>
        <Input id="employer-name" placeholder="Company or organisation" invalid={Boolean(errors.name) || duplicateId !== null} {...register("name")} />
        {duplicateId !== null && (
          <p role="alert" className="text-xs text-status-warn">
            You already track an employer with that name
            {duplicateId && (
              <>
                {" — "}
                <Link href={`/library/employers/${duplicateId}`} className="underline underline-offset-2 hover:text-text-primary">
                  Open it
                </Link>
              </>
            )}
          </p>
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Website" htmlFor="employer-website" error={errors.website?.message}>
          <Input id="employer-website" type="url" inputMode="url" placeholder="https://…" invalid={Boolean(errors.website)} {...register("website")} />
        </FormField>
        <FormField label="Careers page" htmlFor="employer-careers" error={errors.careers_url?.message}>
          <Input id="employer-careers" type="url" inputMode="url" placeholder="https://…/careers" invalid={Boolean(errors.careers_url)} {...register("careers_url")} />
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="employer-notes" error={errors.notes?.message}>
        <Textarea id="employer-notes" rows={4} placeholder="Why them? Culture, stack, things to ask, who you know…" invalid={Boolean(errors.notes)} {...register("notes")} />
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
