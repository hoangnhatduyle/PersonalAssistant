"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PersonalizationSuggestionCard } from "@/components/personalization/PersonalizationSuggestionCard";
import { useSettings } from "@/hooks/useSettings";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";
import { useCourses } from "@/hooks/useCourses";
import { useTasks } from "@/hooks/useTasks";
import { usePersonalizationSuggestions } from "@/hooks/usePersonalizationSuggestions";
import { useReviewSuggestionsAloud } from "@/hooks/useReviewSuggestionsAloud";
import { useToast } from "@/components/ui/Toast";
import { resolveTargetTitle } from "@/lib/personalization/target-title";
import { toneClasses } from "@/lib/status-colors";
import { apiFetch } from "@/lib/http/client";
import type { DailyIntelligenceResponse } from "@/app/api/intelligence/route";
import type { StatusTone } from "@/lib/status-colors";

const CACHE_KEY = "cadence.intelligence";

interface CachedIntelligence {
  narrative: string;
  workload: { tone: StatusTone; message: string };
  date: string;
}

function getCachedIntelligence(): CachedIntelligence | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedIntelligence;
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedIntelligence(data: CachedIntelligence) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be full or disabled
  }
}

export function DailyIntelligenceCard() {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [workload, setWorkload] = useState<CachedIntelligence["workload"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);

  const { data: settings } = useSettings();
  const { speak, isPending: isSpeaking } = useSpeakVoiceResponse();
  const { data: suggestions, refetch: refetchSuggestions } = usePersonalizationSuggestions({ status: ["pending"] });
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const reviewAloud = useReviewSuggestionsAloud();
  const { showToast } = useToast();

  const fetchIntelligence = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiFetch<DailyIntelligenceResponse>("/api/intelligence", { method: "POST" });
      setNarrative(data.narrative);
      setWorkload(data.workload);
      setCachedIntelligence({ narrative: data.narrative, workload: data.workload, date: data.date });

      if (data.suggestionsGenerated > 0) {
        showToast(
          `Found ${data.suggestionsGenerated} new suggestion${data.suggestionsGenerated === 1 ? "" : "s"}`,
          "success",
        );
      }

      // Refetch live suggestion list so Apply/Dismiss state is current
      const { data: fresh } = await refetchSuggestions();

      if (settings?.speak_suggestions_aloud && fresh && fresh.rows.length > 0) {
        await reviewAloud.start(fresh.rows);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [refetchSuggestions, reviewAloud, settings?.speak_suggestions_aloud, showToast]);

  useEffect(() => {
    const cached = getCachedIntelligence();
    if (cached) {
      setNarrative(cached.narrative);
      setWorkload(cached.workload);
    }
  }, []);

  if (dismissed) return null;

  const voiceEnabled = settings?.voice_capture_enabled ?? false;
  const pendingSuggestions = suggestions?.rows ?? [];

  return (
    <GlassPanel variant="glow-ok" className="flex flex-col gap-4 p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-accent-teal">Daily Intelligence</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Dismiss intelligence"
        >
          Dismiss
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Could not generate your daily intelligence.</p>
          <Button size="sm" variant="secondary" onClick={fetchIntelligence}>
            Retry
          </Button>
        </div>
      ) : narrative ? (
        <>
          {/* Workload strip */}
          {workload && (
            <div className={`rounded-panel border px-4 py-3 text-sm ${toneClasses(workload.tone)}`}>
              {workload.message}
            </div>
          )}

          {/* Narrative */}
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">{narrative}</p>

          {/* Personalization suggestions */}
          {pendingSuggestions.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">Suggestions</p>
              {pendingSuggestions.map((suggestion) => (
                <PersonalizationSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  targetTitle={resolveTargetTitle(
                    suggestion.scope,
                    suggestion.target_id,
                    courses?.rows ?? [],
                    tasks?.rows ?? [],
                  )}
                />
              ))}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-2">
            {voiceEnabled && (
              <Button size="sm" variant="secondary" isLoading={isSpeaking} onClick={() => speak(narrative)}>
                Read aloud
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              isLoading={reviewAloud.isActive}
              onClick={fetchIntelligence}
            >
              Refresh
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Tap to generate today&apos;s daily intelligence.</p>
          <Button size="sm" variant="secondary" onClick={fetchIntelligence}>
            Generate
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}
