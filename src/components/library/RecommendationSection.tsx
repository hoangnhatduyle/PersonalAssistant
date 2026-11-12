"use client";

import { useState } from "react";
import {
  useCreateRecommender,
  useCreateRecommenderLetter,
  useDeleteRecommender,
  useDeleteRecommenderLetter,
  useLibraryRecommenders,
  useUpdateRecommender,
  useUpdateRecommenderLetter,
} from "@/hooks/useLibraryRecommenders";
import { RecommenderForm } from "@/components/library/RecommenderForm";
import { RecommenderLetterForm } from "@/components/library/RecommenderLetterForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { LETTER_STATUS_LABEL, RECOMMENDER_STATUS_LABEL } from "@/lib/library/labels";
import type { LetterStatus, RecommenderStatus } from "@/lib/library/constants";
import type { StatusTone } from "@/lib/status-colors";
import type { LibraryRecommender, LibraryRecommenderLetter } from "@/lib/api/entity-types";
import type { LibraryRecommenderLetterPayload, LibraryRecommenderPayload } from "@/lib/api/library-schemas";

const RECOMMENDER_TONE: Record<RecommenderStatus, StatusTone> = { potential: "neutral", asked: "warn", agreed: "ok", declined: "urgent" };
const LETTER_TONE: Record<LetterStatus, StatusTone> = { requested: "warn", received: "ok", declined: "urgent" };

/** "Mar 4, 2026" from a plain `date` value — parsed as a calendar date so no timezone can shift the day. */
export function formatLetterDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function letterDates(letter: LibraryRecommenderLetter): string {
  const parts: string[] = [];
  if (letter.requested_on) parts.push(`asked ${formatLetterDate(letter.requested_on)}`);
  if (letter.received_on) parts.push(`received ${formatLetterDate(letter.received_on)}`);
  return parts.join(" · ");
}

type LetterTarget = { recommender: LibraryRecommender; letter: LibraryRecommenderLetter | null };

/**
 * "Recommendation" — people who can write letters for you, and a log of each
 * letter (including ones already received). Sits below the employers on the
 * Library's Employers tab; add / edit happen in single-level Dialogs.
 */
export function RecommendationSection() {
  const { showToast } = useToast();
  const { data: recommenders, isLoading, isError } = useLibraryRecommenders();
  const createRecommender = useCreateRecommender();
  const updateRecommender = useUpdateRecommender();
  const deleteRecommender = useDeleteRecommender();
  const createLetter = useCreateRecommenderLetter();
  const updateLetter = useUpdateRecommenderLetter();
  const deleteLetter = useDeleteRecommenderLetter();

  const [recommenderTarget, setRecommenderTarget] = useState<LibraryRecommender | "new" | null>(null);
  const [letterTarget, setLetterTarget] = useState<LetterTarget | null>(null);
  const [deleteRecommenderTarget, setDeleteRecommenderTarget] = useState<LibraryRecommender | null>(null);
  const [deleteLetterTarget, setDeleteLetterTarget] = useState<LibraryRecommenderLetter | null>(null);

  const handleRecommenderSubmit = async (values: LibraryRecommenderPayload) => {
    if (recommenderTarget === "new") {
      await createRecommender.mutateAsync(values);
      showToast("Recommender added", "success");
    } else if (recommenderTarget) {
      await updateRecommender.mutateAsync({ id: recommenderTarget.id, patch: values });
      showToast("Recommender updated", "success");
    }
    setRecommenderTarget(null);
  };

  const handleLetterSubmit = async (values: LibraryRecommenderLetterPayload) => {
    if (!letterTarget) return;
    if (letterTarget.letter) {
      await updateLetter.mutateAsync({ id: letterTarget.letter.id, patch: values });
      showToast("Letter updated", "success");
    } else {
      await createLetter.mutateAsync({ recommenderId: letterTarget.recommender.id, payload: values });
      showToast("Letter logged", "success");
    }
    setLetterTarget(null);
  };

  const confirmDeleteRecommender = async () => {
    if (!deleteRecommenderTarget) return;
    try {
      await deleteRecommender.mutateAsync(deleteRecommenderTarget.id);
      showToast("Recommender removed", "success");
    } catch {
      showToast("Could not remove the recommender", "error");
    } finally {
      setDeleteRecommenderTarget(null);
    }
  };

  const confirmDeleteLetter = async () => {
    if (!deleteLetterTarget) return;
    try {
      await deleteLetter.mutateAsync(deleteLetterTarget.id);
      showToast("Letter removed", "success");
    } catch {
      showToast("Could not remove the letter", "error");
    } finally {
      setDeleteLetterTarget(null);
    }
  };

  const list = recommenders ?? [];

  return (
    <section aria-labelledby="recommendation-heading" className="flex flex-col gap-4 border-t border-panel-border pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Letters</p>
          <h2 id="recommendation-heading" className="mt-1 font-display text-xl font-semibold text-text-primary">
            Recommendation
          </h2>
        </div>
        <Button variant="secondary" onClick={() => setRecommenderTarget("new")}>
          Add recommender
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load your recommenders" description="Check your connection and try again." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No recommenders yet"
          description="Keep track of who you can ask for a recommendation letter, and log the letters you already have."
          action={<Button onClick={() => setRecommenderTarget("new")}>Add your first recommender</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((recommender) => (
            <li key={recommender.id} className="flex flex-col gap-3 rounded-panel border border-panel-border bg-panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-text-primary">{recommender.name}</h3>
                  {(recommender.affiliation || recommender.relationship) && (
                    <p className="mt-0.5 text-sm text-text-secondary">{[recommender.affiliation, recommender.relationship].filter(Boolean).join(" · ")}</p>
                  )}
                  {recommender.email && (
                    <a href={`mailto:${recommender.email}`} className="mt-0.5 block truncate font-mono text-xs text-text-eyebrow hover:underline">
                      {recommender.email}
                    </a>
                  )}
                </div>
                <Badge tone={RECOMMENDER_TONE[recommender.status]}>{RECOMMENDER_STATUS_LABEL[recommender.status]}</Badge>
              </div>

              {recommender.notes && <p className="whitespace-pre-wrap text-sm text-text-secondary">{recommender.notes}</p>}

              <div className="flex flex-col gap-2">
                <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
                  Letters · {recommender.letters.length}
                </p>
                {recommender.letters.length === 0 ? (
                  <p className="text-sm text-text-secondary">None logged yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {recommender.letters.map((letter) => (
                      <li key={letter.id} className="flex flex-col gap-1 rounded-control border border-panel-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-text-primary">{letter.purpose}</p>
                          <Badge tone={LETTER_TONE[letter.status]}>{LETTER_STATUS_LABEL[letter.status]}</Badge>
                        </div>
                        {letterDates(letter) && <p className="font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">{letterDates(letter)}</p>}
                        {letter.notes && <p className="whitespace-pre-wrap text-xs text-text-secondary">{letter.notes}</p>}
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" aria-label={`Edit letter for ${letter.purpose}`} onClick={() => setLetterTarget({ recommender, letter })}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" aria-label={`Delete letter for ${letter.purpose}`} onClick={() => setDeleteLetterTarget(letter)}>
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-auto flex flex-wrap gap-1">
                <Button variant="secondary" size="sm" aria-label={`Log a letter from ${recommender.name}`} onClick={() => setLetterTarget({ recommender, letter: null })}>
                  Log letter
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Edit ${recommender.name}`} onClick={() => setRecommenderTarget(recommender)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Delete ${recommender.name}`} onClick={() => setDeleteRecommenderTarget(recommender)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={recommenderTarget !== null} onClose={() => setRecommenderTarget(null)} title={recommenderTarget === "new" ? "Add a recommender" : "Edit recommender"}>
        {recommenderTarget !== null && (
          <RecommenderForm
            recommender={recommenderTarget === "new" ? undefined : recommenderTarget}
            onSubmit={handleRecommenderSubmit}
            onCancel={() => setRecommenderTarget(null)}
            submitLabel={recommenderTarget === "new" ? "Add recommender" : "Save changes"}
          />
        )}
      </Dialog>

      <Dialog
        open={letterTarget !== null}
        onClose={() => setLetterTarget(null)}
        title={letterTarget?.letter ? "Edit letter" : `Log a letter from ${letterTarget?.recommender.name ?? ""}`}
      >
        {letterTarget !== null && (
          <RecommenderLetterForm
            letter={letterTarget.letter ?? undefined}
            onSubmit={handleLetterSubmit}
            onCancel={() => setLetterTarget(null)}
            submitLabel={letterTarget.letter ? "Save changes" : "Log letter"}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteRecommenderTarget !== null}
        onClose={() => setDeleteRecommenderTarget(null)}
        onConfirm={confirmDeleteRecommender}
        title={`Remove ${deleteRecommenderTarget?.name}?`}
        description="Their logged letters are removed too."
        confirmLabel="Remove recommender"
        isConfirming={deleteRecommender.isPending}
      />
      <ConfirmDialog
        open={deleteLetterTarget !== null}
        onClose={() => setDeleteLetterTarget(null)}
        onConfirm={confirmDeleteLetter}
        title={`Remove the letter for "${deleteLetterTarget?.purpose}"?`}
        description="It disappears from this recommender's log."
        confirmLabel="Remove letter"
        isConfirming={deleteLetter.isPending}
      />
    </section>
  );
}
