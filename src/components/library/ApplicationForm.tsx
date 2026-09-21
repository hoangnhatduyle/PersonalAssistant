"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { libraryApplicationPayloadSchema, type LibraryApplicationFormInput, type LibraryApplicationPayload } from "@/lib/api/library-schemas";
import type { LibraryApplication } from "@/lib/api/entity-types";
import { useLibraryEmployers } from "@/hooks/useLibraryEmployers";
import { ApiError } from "@/lib/http/client";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL } from "@/lib/library/application-status";
import { SALARY_PERIODS, WORK_MODES } from "@/lib/library/constants";
import { WORK_MODE_LABEL } from "@/lib/library/labels";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TagInput } from "@/components/ui/TagInput";
import { Textarea } from "@/components/ui/Textarea";

const PICKER_LIMIT = 100;
const PERIOD_LABEL = { year: "per year", month: "per month", hour: "per hour" } as const;

/** Local calendar date as YYYY-MM-DD (what an <input type="date"> holds). */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Props = {
  /** Fixed employer (the dossier's "Add role"); omit to show an employer picker. */
  employerId?: string;
  /** Present when editing: status is then not editable here (it moves through the status control). */
  application?: LibraryApplication;
  /** Rejects with an ApiError on failure — this form renders the 409 "already tracked" and generic messages itself. */
  onSubmit: (values: LibraryApplicationPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function ApplicationForm({ employerId, application, onSubmit, onCancel, submitLabel = "Save role" }: Props) {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(application);
  const { data: employers, isLoading: employersLoading } = useLibraryEmployers({ limit: PICKER_LIMIT }, { enabled: !employerId && !isEditing });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LibraryApplicationFormInput, unknown, LibraryApplicationPayload>({
    resolver: zodResolver(libraryApplicationPayloadSchema),
    defaultValues: {
      employer_id: application?.employer_id ?? employerId ?? "",
      title: application?.title ?? "",
      job_url: application?.job_url ?? "",
      location: application?.location ?? "",
      work_mode: application?.work_mode ?? "",
      salary_min: application?.salary_min?.toString() ?? "",
      salary_max: application?.salary_max?.toString() ?? "",
      salary_currency: application?.salary_currency ?? "",
      salary_period: application?.salary_period ?? "",
      tech_stack: application?.tech_stack ?? [],
      date_found: application?.date_found ?? todayLocal(),
      ...(isEditing ? {} : { status: "interested" as const }),
      notes: application?.notes ?? "",
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
        setFormError(error instanceof Error ? error.message : "Could not save the role");
      }
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {!employerId && !isEditing && (
        <FormField label="Employer" htmlFor="application-employer" error={errors.employer_id?.message}>
          <Select id="application-employer" invalid={Boolean(errors.employer_id)} disabled={employersLoading} {...register("employer_id")}>
            <option value="">{employersLoading ? "Loading…" : "Choose an employer"}</option>
            {(employers?.rows ?? []).map((employer) => (
              <option key={employer.id} value={employer.id}>
                {employer.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField label="Role" htmlFor="application-title" error={errors.title?.message}>
        <Input id="application-title" placeholder="Senior Frontend Engineer" invalid={Boolean(errors.title)} {...register("title")} />
      </FormField>

      <FormField label="Job posting" htmlFor="application-job-url" error={errors.job_url?.message}>
        <Input id="application-job-url" type="url" inputMode="url" placeholder="https://…" invalid={Boolean(errors.job_url) || duplicateId !== null} {...register("job_url")} />
        {duplicateId !== null && (
          <p role="alert" className="text-xs text-status-warn">
            You already track this job
            {duplicateId && (
              <>
                {" — "}
                <Link href="/library/employers" className="underline underline-offset-2 hover:text-text-primary">
                  see your employers
                </Link>
              </>
            )}
          </p>
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Location" htmlFor="application-location" error={errors.location?.message}>
          <Input id="application-location" placeholder="City, country" invalid={Boolean(errors.location)} {...register("location")} />
        </FormField>
        <FormField label="Work mode" htmlFor="application-work-mode">
          <Select id="application-work-mode" {...register("work_mode")}>
            <option value="">Not specified</option>
            {WORK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {WORK_MODE_LABEL[mode]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-eyebrow">Salary range</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input type="number" inputMode="numeric" min={0} aria-label="Minimum salary" placeholder="Min" invalid={Boolean(errors.salary_min)} {...register("salary_min")} />
          <Input type="number" inputMode="numeric" min={0} aria-label="Maximum salary" placeholder="Max" invalid={Boolean(errors.salary_max)} {...register("salary_max")} />
          <Input aria-label="Currency" placeholder="USD" maxLength={3} className="uppercase" invalid={Boolean(errors.salary_currency)} {...register("salary_currency")} />
          <Select aria-label="Salary period" {...register("salary_period")}>
            <option value="">Period</option>
            {SALARY_PERIODS.map((period) => (
              <option key={period} value={period}>
                {PERIOD_LABEL[period]}
              </option>
            ))}
          </Select>
        </div>
        {(errors.salary_min || errors.salary_max || errors.salary_currency) && (
          <p role="alert" className="text-xs text-status-urgent">
            {errors.salary_max?.message ?? errors.salary_min?.message ?? errors.salary_currency?.message}
          </p>
        )}
      </fieldset>

      <FormField label="Tech stack" error={errors.tech_stack?.message}>
        <Controller control={control} name="tech_stack" render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a technology…" />} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date found" htmlFor="application-date-found" error={errors.date_found?.message}>
          <Input id="application-date-found" type="date" invalid={Boolean(errors.date_found)} {...register("date_found")} />
        </FormField>
        {!isEditing && (
          <FormField label="Status" htmlFor="application-status">
            <Select id="application-status" {...register("status")}>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {APPLICATION_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <FormField label="Notes" htmlFor="application-notes" error={errors.notes?.message}>
        <Textarea id="application-notes" rows={3} placeholder="Requirements, impressions, who referred you…" invalid={Boolean(errors.notes)} {...register("notes")} />
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
