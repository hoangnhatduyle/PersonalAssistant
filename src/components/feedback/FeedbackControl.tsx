"use client";

import { useMemo, useState } from "react";
import { useCreateFeedback, useDeleteFeedback, useFeedback } from "@/hooks/useFeedback";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import type { FeedbackPayload } from "@/lib/api/schemas";

type Props = {
  targetType: "deadline" | "task" | "reminder";
  targetId: string;
};

const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * No `?targetId=` filter exists server-side (GET /api/feedback returns the
 * caller's full history, own rows only) — filters the same useFeedback()
 * cache client-side per target. Submit-once, delete-anytime: once a rating
 * exists for this target it renders read-only with a delete affordance
 * instead of the interactive form.
 */
export function FeedbackControl({ targetType, targetId }: Props) {
  const { data: feedback, isLoading } = useFeedback();
  const createFeedback = useCreateFeedback();
  const { showToast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const existing = useMemo(
    () => feedback?.find((row) => row.target_type === targetType && row.target_id === targetId),
    [feedback, targetType, targetId],
  );
  const deleteFeedback = useDeleteFeedback(existing?.id ?? "");

  if (isLoading) return null;

  if (existing) {
    const handleDelete = async () => {
      try {
        await deleteFeedback.mutateAsync();
        showToast("Feedback removed", "success");
      } catch {
        showToast("Could not remove feedback", "error");
      }
    };

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5" aria-label={`Rated ${existing.rating} out of 5`}>
          {RATING_VALUES.map((value) => (
            <StarIcon key={value} filled={value <= existing.rating} />
          ))}
        </div>
        {existing.comment && <p className="text-xs text-text-secondary">&quot;{existing.comment}&quot;</p>}
        <Button variant="ghost" size="sm" isLoading={deleteFeedback.isPending} onClick={handleDelete}>
          Delete feedback
        </Button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (rating === 0) return;
    const payload: FeedbackPayload = {
      target_type: targetType,
      target_id: targetId,
      rating,
      comment: comment.trim() || undefined,
    };
    try {
      await createFeedback.mutateAsync(payload);
      showToast("Feedback submitted", "success");
      setRating(0);
      setComment("");
    } catch {
      showToast("Could not submit feedback", "error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
          {RATING_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === rating}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              onClick={() => setRating(value)}
            >
              <StarIcon filled={value <= rating} />
            </button>
          ))}
        </div>
        <Button size="sm" disabled={rating === 0} isLoading={createFeedback.isPending} onClick={handleSubmit}>
          Submit feedback
        </Button>
      </div>
      {rating > 0 && (
        <Textarea
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional comment"
        />
      )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 ${filled ? "fill-status-warn text-status-warn" : "fill-none text-text-secondary"}`}
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        d="M12 2.5l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.6l-6.2 3.2 1.6-6.8L2.2 9.4l6.9-.6z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
