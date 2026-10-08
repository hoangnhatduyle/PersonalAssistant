"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/hooks/useSettings";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";
import { apiFetch } from "@/lib/http/client";
import { isWeeklyReviewReady } from "@/lib/weekly-review/ready-window";
import type { WeeklyReviewResponse } from "@/lib/weekly-review/types";

const CACHE_KEY = "cadence.weeklyReview";

interface CachedReview {
  review: WeeklyReviewResponse;
  /** Browser-local YYYY-MM-DD the review was generated on. */
  cachedOn: string;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readCacheRaw(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

function parseCache(raw: string | null): WeeklyReviewResponse | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedReview;
    return parsed.cachedOn === localDateKey(new Date()) ? parsed.review : null;
  } catch {
    return null;
  }
}

function writeCache(review: WeeklyReviewResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ review, cachedOn: localDateKey(new Date()) } satisfies CachedReview));
  } catch {
    // localStorage may be full or disabled
  }
}

const subscribeNever = () => () => {};

type Props = {
  onDismiss?: () => void;
};

/**
 * Last week's results, what is still open, and next week's load, beside the
 * Daily Intelligence card. The numbers come from POST /api/weekly-review (all
 * computed in code); the same data backs the voice "get_weekly_review" tool.
 */
export function WeeklyReviewCard({ onDismiss }: Props) {
  const [generated, setGenerated] = useState<WeeklyReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: settings } = useSettings();
  const { speak, isPending: isSpeaking } = useSpeakVoiceResponse();

  // localStorage and the clock are client-only; reading them through
  // useSyncExternalStore keeps the server render and first client render
  // identical (empty / not ready) instead of mismatching on hydration.
  const cachedRaw = useSyncExternalStore(subscribeNever, readCacheRaw, () => null);
  const timezone = settings?.timezone;
  const ready = useSyncExternalStore(
    subscribeNever,
    () => isWeeklyReviewReady(new Date(), timezone),
    () => false,
  );

  const cachedReview = useMemo(() => parseCache(cachedRaw), [cachedRaw]);
  const review = generated ?? cachedReview;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiFetch<WeeklyReviewResponse>("/api/weekly-review", { method: "POST" });
      setGenerated(data);
      writeCache(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  if (dismissed) return null;

  const voiceEnabled = settings?.voice_capture_enabled ?? false;

  return (
    <GlassPanel variant={ready ? "glow-warn" : "default"} className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-wide text-accent-indigo">Weekly Review</p>
          {ready && (
            <span className="rounded-full bg-status-warn/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-warn">
              Ready for review
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Dismiss weekly review"
        >
          Dismiss
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Could not generate your weekly review.</p>
          <Button size="sm" variant="secondary" onClick={generate}>
            Retry
          </Button>
        </div>
      ) : review ? (
        <ReviewBody
          review={review}
          voiceEnabled={voiceEnabled}
          isSpeaking={isSpeaking}
          onSpeak={() => speak([review.narrative, ...review.recommendations].join(" "))}
          onRefresh={generate}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">See how last week went and what next week looks like.</p>
          <Button size="sm" variant="secondary" onClick={generate}>
            Generate
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}

function Stat({ label, value, caption, urgent = false }: { label: string; value: string; caption: string; urgent?: boolean }) {
  return (
    <div>
      <p className="font-mono text-xs text-text-secondary">{label}</p>
      <p className={`font-display text-lg font-semibold ${urgent ? "text-status-urgent" : "text-text-primary"}`}>{value}</p>
      <p className="font-mono text-[10px] text-text-secondary">{caption}</p>
    </div>
  );
}

function ReviewBody({
  review,
  voiceEnabled,
  isSpeaking,
  onSpeak,
  onRefresh,
}: {
  review: WeeklyReviewResponse;
  voiceEnabled: boolean;
  isSpeaking: boolean;
  onSpeak: () => void;
  onRefresh: () => void;
}) {
  const { lastWeek, pending, nextWeek } = review.data;
  const doneOfDue = lastWeek.dueCount - lastWeek.stillOpen;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Completed"
          value={String(lastWeek.completedCount)}
          caption={lastWeek.dueCount > 0 ? `${doneOfDue}/${lastWeek.dueCount} due items done` : "nothing was due"}
        />
        <Stat
          label="On-time"
          value={lastWeek.onTimeRate === null ? "—" : `${lastWeek.onTimeRate}%`}
          caption={`${lastWeek.completedOnTime} on time · ${lastWeek.completedLate} late`}
        />
        <Stat
          label="Past due"
          value={String(pending.pastDueCount)}
          caption={pending.dueTodayCount > 0 ? `${pending.dueTodayCount} due today` : "open items"}
          urgent={pending.pastDueCount > 0}
        />
      </div>

      <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">{review.narrative}</p>

      {pending.unresolvedEmails && (
        <div className="flex flex-col gap-1.5" data-testid="unresolved-emails">
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
            {pending.unresolvedEmails.count} unresolved {pending.unresolvedEmails.count === 1 ? "email" : "emails"}
          </p>
          <ul className="flex flex-col gap-1">
            {pending.unresolvedEmails.items.slice(0, 3).map((email, index) => (
              <li key={`${email.subject}-${index}`} className="truncate text-sm text-text-primary">
                {email.subject}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Next 7 days</p>
        <div className="grid grid-cols-7 gap-1" data-testid="next-week-strip">
          {nextWeek.days.map((day) => {
            const isCollision = day.total >= 3;
            return (
              <div
                key={day.dateKey}
                title={day.titles.length > 0 ? day.titles.join(", ") : "Nothing due"}
                className={`flex flex-col items-center rounded-md border px-1 py-1.5 ${
                  isCollision ? "border-status-warn/40 bg-status-warn/10" : "border-panel-border"
                }`}
              >
                <span className="font-mono text-[10px] uppercase text-text-secondary">{day.weekday.slice(0, 3)}</span>
                <span className={`font-display text-base font-semibold ${day.total === 0 ? "text-text-eyebrow" : isCollision ? "text-status-warn" : "text-text-primary"}`}>
                  {day.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {review.recommendations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Recommended</p>
          <ul className="flex flex-col gap-1.5">
            {review.recommendations.map((recommendation) => (
              <li key={recommendation} className="text-sm text-text-primary">
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        {voiceEnabled && (
          <Button size="sm" variant="secondary" isLoading={isSpeaking} onClick={onSpeak}>
            Read aloud
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </>
  );
}
