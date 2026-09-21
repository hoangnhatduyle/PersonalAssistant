"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { libraryInterviewPayloadSchema, type LibraryInterviewFormInput, type LibraryInterviewPayload } from "@/lib/api/library-schemas";
import type { LibraryInterviewWithPerson } from "@/lib/api/entity-types";
import { usePeople } from "@/hooks/usePeople";
import { INTERVIEW_KINDS, INTERVIEW_OUTCOMES } from "@/lib/library/constants";
import { INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOME_LABEL } from "@/lib/library/labels";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

const PICKER_LIMIT = 100;

type Props = {
  interview?: LibraryInterviewWithPerson;
  onSubmit: (values: LibraryInterviewPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function InterviewForm({ interview, onSubmit, onCancel, submitLabel = "Save round" }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const { data: people } = usePeople({ limit: PICKER_LIMIT });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LibraryInterviewFormInput, unknown, LibraryInterviewPayload>({
    resolver: zodResolver(libraryInterviewPayloadSchema),
    defaultValues: {
      round_label: interview?.round_label ?? "",
      kind: interview?.kind ?? "screen",
      scheduled_at: interview?.scheduled_at ?? null,
      outcome: interview?.outcome ?? "pending",
      interviewer_person_id: interview?.interviewer?.id ?? "",
      notes: interview?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save the round");
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Round" htmlFor="interview-round" error={errors.round_label?.message}>
        <Input id="interview-round" placeholder="Recruiter call, System design, Final…" invalid={Boolean(errors.round_label)} {...register("round_label")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type" htmlFor="interview-kind">
          <Select id="interview-kind" {...register("kind")}>
            {INTERVIEW_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {INTERVIEW_KIND_LABEL[kind]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Outcome" htmlFor="interview-outcome">
          <Select id="interview-outcome" {...register("outcome")}>
            {INTERVIEW_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {INTERVIEW_OUTCOME_LABEL[outcome]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="When" htmlFor="interview-when" error={errors.scheduled_at?.message}>
          <Controller
            control={control}
            name="scheduled_at"
            render={({ field }) => <DateTimeField id="interview-when" value={field.value} onChange={field.onChange} invalid={Boolean(errors.scheduled_at)} />}
          />
        </FormField>
        <FormField label="Interviewer" htmlFor="interview-person">
          <Select id="interview-person" {...register("interviewer_person_id")}>
            <option value="">Not set</option>
            {(people?.rows ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="interview-notes" error={errors.notes?.message}>
        <Textarea id="interview-notes" rows={4} placeholder="Questions asked, how it went, follow-ups…" invalid={Boolean(errors.notes)} {...register("notes")} />
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
