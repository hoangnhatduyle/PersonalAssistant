"use client";

import { useState } from "react";
import { ApplicationForm } from "@/components/library/ApplicationForm";
import { ApplicationStatusControl } from "@/components/library/ApplicationStatusControl";
import { ApplicationTimeline } from "@/components/library/ApplicationTimeline";
import { InterviewLog } from "@/components/library/InterviewLog";
import { StageStepper } from "@/components/library/StageStepper";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useApplicationTransition, useDeleteLibraryApplication, useUpdateLibraryApplication } from "@/hooks/useLibraryApplications";
import { daysInStage, isActiveStatus, type ApplicationStatus } from "@/lib/library/application-status";
import { WORK_MODE_LABEL } from "@/lib/library/labels";
import { formatSalaryRange } from "@/lib/library/salary";
import { safeExternalHref } from "@/lib/library/url";
import type { LibraryApplicationPayload } from "@/lib/api/library-schemas";
import type { LibraryApplication } from "@/lib/api/entity-types";

type Props = {
  application: LibraryApplication;
  now?: Date;
};

/** One role in the employer dossier: stage, facts, status control, edit/delete, interview log and timeline. */
export function ApplicationPanel({ application, now }: Props) {
  const { showToast } = useToast();
  const transition = useApplicationTransition();
  const updateApplication = useUpdateLibraryApplication(application.id);
  const deleteApplication = useDeleteLibraryApplication(application.id);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  const href = safeExternalHref(application.job_url);
  const days = daysInStage(application.status_changed_at, now);
  const salary = formatSalaryRange({
    min: application.salary_min,
    max: application.salary_max,
    currency: application.salary_currency,
    period: application.salary_period,
  });
  const facts = [application.work_mode ? WORK_MODE_LABEL[application.work_mode] : null, application.location, salary].filter(Boolean);

  const handleMove = (to: ApplicationStatus) => transition.mutate({ id: application.id, to });

  const handleEdit = async (values: LibraryApplicationPayload) => {
    await updateApplication.mutateAsync(values);
    showToast("Role updated", "success");
    setEditOpen(false);
  };

  const handleDelete = async () => {
    try {
      await deleteApplication.mutateAsync();
      showToast("Role deleted", "success");
    } catch {
      showToast("Could not delete the role", "error");
    } finally {
      setDeleteOpen(false);
    }
  };

  return (
    <article
      aria-label={application.title}
      data-dossier-status={application.status}
      data-muted={!isActiveStatus(application.status)}
      className="employer-card flex flex-col gap-4 rounded-panel border p-4 pl-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-tight text-text-primary">{application.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
            <StageStepper status={application.status} />
            <span>{days === 0 ? "Moved today" : `${days}d in stage`}</span>
            <span>Found {application.date_found}</span>
          </p>
        </div>
        <div className="w-40 shrink-0">
          <ApplicationStatusControl value={application.status} onChange={handleMove} label={`Status for ${application.title}`} />
        </div>
      </header>

      {facts.length > 0 && <p className="text-sm text-text-secondary">{facts.join(" · ")}</p>}

      {application.tech_stack.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
          {application.tech_stack.map((tech) => (
            <li key={tech} className="rounded-full border border-panel-border px-2 py-0.5 font-mono text-[0.7rem] text-text-secondary">
              {tech}
            </li>
          ))}
        </ul>
      )}

      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="w-fit font-mono text-sm text-accent-indigo underline underline-offset-4 hover:text-text-primary">
          Open job posting ↗
        </a>
      )}
      {application.job_url && !href && <p className="font-mono text-sm text-text-secondary">{application.job_url}</p>}

      {application.notes && <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{application.notes}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <InterviewLog applicationId={application.id} applicationLabel={application.title} />
        <ApplicationTimeline applicationId={application.id} applicationLabel={application.title} />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          Edit role
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete role
        </Button>
      </div>

      <Dialog open={isEditOpen} onClose={() => setEditOpen(false)} title="Edit role" size="lg">
        <ApplicationForm application={application} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} submitLabel="Save changes" />
      </Dialog>

      <ConfirmDialog
        open={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete "${application.title}"?`}
        description="The role and its interview log leave your pipeline. The job link can be tracked again afterwards."
        confirmLabel="Delete role"
        isConfirming={deleteApplication.isPending}
      />
    </article>
  );
}
