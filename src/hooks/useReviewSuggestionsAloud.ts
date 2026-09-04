"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCourses } from "@/hooks/useCourses";
import { useTasks } from "@/hooks/useTasks";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";
import { useAutoStopRecorder } from "@/hooks/useAutoStopRecorder";
import { apiFetch } from "@/lib/http/client";
import { classifyYesNo } from "@/lib/voice/yes-no";
import { resolveTargetTitle } from "@/lib/personalization/target-title";
import { applyPersonalizationSuggestion, dismissPersonalizationSuggestion } from "@/lib/api/suggestions-client";
import { courseKeys, personalizationSuggestionKeys, reminderKeys, taskKeys } from "@/lib/query/keys";
import { CONFIRM_MAX_DURATION_MS, CONFIRM_SILENCE_MS, SPEAK_TIMEOUT_MS } from "@/lib/voice/constants";
import type { PersonalizationSuggestionRow } from "@/lib/api/entity-types";
import type { VoiceTranscribeResponse } from "@/app/api/voice/transcribe/route";

// Fallback beyond the recorder's own max duration, so listenOnce() below
// always settles even if useAutoStopRecorder's onComplete never fires (its
// documented behavior when no speech is ever detected).
const LISTEN_TIMEOUT_MS = CONFIRM_MAX_DURATION_MS + 1000;

/**
 * Races `promise` against a `ms` timer -- resolves "timeout" instead of
 * hanging forever when `promise` never settles. Used below so a stalled
 * speakResponse.mutateAsync() (no timeout of its own anywhere in its fetch
 * chain -- see useSpeakVoiceResponse.ts) can't leave start()'s loop, and
 * therefore the calling component's own busy state, stuck until a manual
 * refresh (the confirmed root cause of an intermittently "stuck" Assistant/
 * Daily Intelligence card).
 */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

export interface UseReviewSuggestionsAloudResult {
  /** Speaks each suggestion in order, listens for a yes/no, applies/dismisses accordingly. Stops early on an unclear or absent answer, leaving the rest pending. */
  start: (suggestions: PersonalizationSuggestionRow[]) => Promise<void>;
  isActive: boolean;
}

/**
 * Shared by CaptureChannel (triggered after a voice-originated
 * "personalization_suggestions" query) and DailyIntelligenceCard
 * (gated behind the speak_suggestions_aloud setting). A hook so it can call
 * useCourses/useTasks/useQueryClient/useSpeakVoiceResponse at its own top
 * level — `start()` itself is a plain async function, not a hook, since it
 * loops over N suggestions (hooks can't be called inside a loop).
 */
export function useReviewSuggestionsAloud(): UseReviewSuggestionsAloudResult {
  const { data: courses } = useCourses();
  const { data: tasks } = useTasks();
  const queryClient = useQueryClient();
  const speakResponse = useSpeakVoiceResponse();
  const [isActive, setIsActive] = useState(false);
  const pendingResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const { start: startListening } = useAutoStopRecorder(
    (blob) => {
      pendingResolveRef.current?.(blob);
      pendingResolveRef.current = null;
    },
    { silenceMs: CONFIRM_SILENCE_MS, maxDurationMs: CONFIRM_MAX_DURATION_MS },
  );

  const listenOnce = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        pendingResolveRef.current = null;
        resolve(blob);
      };
      pendingResolveRef.current = settle;
      startListening().catch(() => settle(null));
      setTimeout(() => settle(null), LISTEN_TIMEOUT_MS);
    });
  }, [startListening]);

  const start = useCallback(
    async (suggestions: PersonalizationSuggestionRow[]) => {
      setIsActive(true);
      try {
        for (const suggestion of suggestions) {
          const title = resolveTargetTitle(suggestion.scope, suggestion.target_id, courses?.rows ?? [], tasks?.rows ?? []);
          const sentence = `For ${title}, move the reminder lead time from ${suggestion.from_value} to ${suggestion.to_value} minutes. ${suggestion.rationale} Say yes to apply, or no to skip.`;
          const speakResult = await raceTimeout(
            speakResponse.mutateAsync(sentence).catch(() => null), // Toast already surfaced by useSpeakVoiceResponse's onError.
            SPEAK_TIMEOUT_MS,
          );
          // A genuinely hung speak call, unlike a fast-failing one, means we
          // can't be confident the sentence ever played or ever will --
          // stop reviewing rather than ask the user to answer a question
          // they may not have heard, or risk the still-pending promise
          // resolving unexpectedly later.
          if (speakResult === "timeout") break;

          const blob = await listenOnce();
          if (!blob) break; // no answer / mic unavailable — stop, leave the rest pending

          let transcript = "";
          try {
            const { data } = await apiFetch<VoiceTranscribeResponse>("/api/voice/transcribe", {
              method: "POST",
              body: blob,
              headers: { "Content-Type": blob.type },
            });
            transcript = data.transcript;
          } catch {
            break;
          }

          const answer = classifyYesNo(transcript);
          if (answer === "yes") {
            try {
              await applyPersonalizationSuggestion(suggestion.id);
            } catch {
              break;
            }
            queryClient.invalidateQueries({ queryKey: personalizationSuggestionKeys.all });
            queryClient.invalidateQueries({ queryKey: courseKeys.all });
            queryClient.invalidateQueries({ queryKey: taskKeys.all });
            queryClient.invalidateQueries({ queryKey: reminderKeys.all });
          } else if (answer === "no") {
            try {
              await dismissPersonalizationSuggestion(suggestion.id);
            } catch {
              break;
            }
            queryClient.invalidateQueries({ queryKey: personalizationSuggestionKeys.all });
          } else {
            break; // unclear answer — stop rather than guess
          }
        }
      } finally {
        setIsActive(false);
      }
    },
    [courses, tasks, speakResponse, listenOnce, queryClient],
  );

  return { start, isActive };
}
