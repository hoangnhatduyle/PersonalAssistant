"use client";

import { useState } from "react";
import { useCreateInterview, useDeleteInterview, useLibraryInterviews, useUpdateInterview } from "@/hooks/useLibraryInterviews";
import { InterviewForm } from "@/components/library/InterviewForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOME_LABEL } from "@/lib/library/labels";
import type { InterviewOutcome } from "@/lib/library/constants";
import type { StatusTone } from "@/lib/status-colors";
import type { LibraryInterviewPayload } from "@/lib/api/library-schemas";
import type { LibraryInterviewWithPerson } from "@/lib/api/entity-types";

const OUTCOME_TONE: Record<InterviewOutcome, StatusTone> = { pending: "warn", passed: "ok", failed: "urgent", cancelled: "neutral" };

export function formatInterviewWhen(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

type Props = {
  applicationId: string;
  /** e.g. "Frontend Engineer" — names the section for assistive tech. */
  applicationLabel: string;
};

/** The interview rounds of one application: add / edit (in a Dialog, single level) / delete. */
export function InterviewLog({ applicationId, applicationLabel }: Props) {
  const { showToast } = useToast();
  const { data: interviews, isLoading, isError } = useLibraryInterviews(applicationId);
  const createInterview = useCreateInterview(applicationId);
  const updateInterview = useUpdateInterview();
  const deleteInterview = useDeleteInterview();
  const [formTarget, setFormTarget] = useState<LibraryInterviewWithPerson | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryInterviewWithPerson | null>(null);

  const handleSubmit = async (values: LibraryInterviewPayload) => {
    if (formTarget === "new") {
      await createInterview.mutateAsync(values);
      showToast("Round added", "success");
    } else if (formTarget) {
      await updateInterview.mutateAsync({ id: formTarget.id, patch: values });
      showToast("Round updated", "success");
    }
    setFormTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInterview.mutateAsync(deleteTarget.id);
      showToast("Round removed", "success");
    } catch {
      showToast("Could not remove the round", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section aria-label={`Interviews for ${applicationLabel}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Interviews</h4>
        <Button variant="secondary" size="sm" onClick={() => setFormTarget("new")}>
          Add round
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : isError ? (
        <p className="text-sm text-status-urgent">Could not load interviews.</p>
      ) : (interviews ?? []).length === 0 ? (
        <p className="text-sm text-text-secondary">No rounds logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {interviews!.map((interview) => (
            <li key={interview.id} className="flex flex-col gap-1.5 rounded-control border border-panel-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-sm font-semibold text-text-primary">{interview.round_label}</p>
                <div className="flex items-center gap-1.5">
                  <Badge tone="neutral">{INTERVIEW_KIND_LABEL[interview.kind]}</Badge>
                  <Badge tone={OUTCOME_TONE[interview.outcome]}>{INTERVIEW_OUTCOME_LABEL[interview.outcome]}</Badge>
                </div>
              </div>
              <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
                {formatInterviewWhen(interview.scheduled_at)}
                {interview.interviewer ? ` · with ${interview.interviewer.name}` : ""}
              </p>
              {interview.notes && <p className="whitespace-pre-wrap text-sm text-text-secondary">{interview.notes}</p>}
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setFormTarget(interview)} aria-label={`Edit ${interview.round_label}`}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(interview)} aria-label={`Delete ${interview.round_label}`}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={formTarget !== null} onClose={() => setFormTarget(null)} title={formTarget === "new" ? "Add an interview round" : "Edit interview round"}>
        {formTarget !== null && (
          <InterviewForm
            interview={formTarget === "new" ? undefined : formTarget}
            onSubmit={handleSubmit}
            onCancel={() => setFormTarget(null)}
            submitLabel={formTarget === "new" ? "Add round" : "Save changes"}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Remove "${deleteTarget?.round_label}"?`}
        description="It disappears from the interview log and timeline."
        confirmLabel="Remove round"
        isConfirming={deleteInterview.isPending}
      />
    </section>
  );
}
