import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { appointmentKeys, courseKeys, deadlineKeys, noteKeys, reminderKeys, taskKeys, todoListKeys } from "@/lib/query/keys";
import type { VoiceTurnResult } from "@/lib/voice/session";
import type { MutationExecutionResult } from "@/lib/voice/mutations";

export type VoiceTurnClientInput = { audio: Blob; mimetype: string } | { transcript: string };

/**
 * Invalidates every entity a mutating voice turn could plausibly have
 * touched. Voice mutations aren't scoped to one entity ahead of time (the
 * intent resolver decides at runtime), so this mirrors the REST hooks'
 * "invalidate broadly, it's cheap at this app's scale" approach rather than
 * trying to parse which entity a given turn affected.
 */
function invalidateAfterMutation(queryClient: ReturnType<typeof useQueryClient>) {
  // course.delete is a real PendingMutation (src/lib/voice/mutations.ts) —
  // course must be included, not just its cascaded deadlines/notes.
  queryClient.invalidateQueries({ queryKey: courseKeys.all });
  queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
  queryClient.invalidateQueries({ queryKey: taskKeys.all });
  queryClient.invalidateQueries({ queryKey: noteKeys.all });
  queryClient.invalidateQueries({ queryKey: reminderKeys.all });
  // Deadline Sessions (appointments) and Board Lists — also real
  // PendingMutation target types now, same broad-invalidation approach.
  // Board Cards are tasks (board merge) — already covered by taskKeys above.
  queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
  queryClient.invalidateQueries({ queryKey: todoListKeys.all });
}

/**
 * POST /api/voice — intake one press-to-talk or text-mode turn. Nothing is
 * ever mutated by this call itself: per src/lib/voice/session.ts, a
 * mutating intent always lands in AwaitingConfirmation (the actual write
 * only happens later via useConfirmVoiceTurn), and a read-only intent
 * (upcoming_schedule/knowledge_lookup) only reads — a knowledge_lookup
 * answer doesn't touch knowledge_sources/knowledge_chunks. So there is
 * nothing to invalidate on this hook's success.
 */
export function useVoiceTurn() {
  return useMutation({
    mutationFn: async (input: VoiceTurnClientInput) => {
      if ("audio" in input) {
        return (
          await apiFetch<VoiceTurnResult>("/api/voice", {
            method: "POST",
            body: input.audio,
            headers: { "Content-Type": input.mimetype },
          })
        ).data;
      }
      return (await apiFetch<VoiceTurnResult>("/api/voice", { method: "POST", body: { transcript: input.transcript } })).data;
    },
  });
}

export interface VoiceConfirmResult {
  session_id: string;
  executed: boolean;
  result: MutationExecutionResult;
  /** Set when confirming this session auto-proposed the next queued step of a multi-step command (session.ts's confirmVoiceSession) — ConfirmationBar applies it exactly like a fresh AwaitingConfirmation turn. */
  next: { session_id: string; message: string } | null;
}

/** POST /api/voice/[sessionId]/confirm — executes the persisted pending mutation. */
export function useConfirmVoiceTurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) =>
      (await apiFetch<VoiceConfirmResult>(`/api/voice/${sessionId}/confirm`, { method: "POST" })).data,
    onSuccess: () => {
      invalidateAfterMutation(queryClient);
    },
  });
}

export interface VoiceDeclineResult {
  session_id: string;
  executed: false;
  message: string;
}

/** POST /api/voice/[sessionId]/decline — no mutation executes. */
export function useDeclineVoiceTurn() {
  return useMutation({
    mutationFn: async (sessionId: string) =>
      (await apiFetch<VoiceDeclineResult>(`/api/voice/${sessionId}/decline`, { method: "POST" })).data,
  });
}

export interface VoiceArmResult {
  session_id: string;
  armed: boolean;
}

/** POST /api/voice/[sessionId]/arm — starts the real confirmation window once the prompt has finished being spoken. Best-effort: never executes anything. */
export function useArmVoiceTurn() {
  return useMutation({
    mutationFn: async (sessionId: string) =>
      (await apiFetch<VoiceArmResult>(`/api/voice/${sessionId}/arm`, { method: "POST" })).data,
  });
}

export interface VoiceExpireResult {
  session_id: string;
  expired: boolean;
}

/** POST /api/voice/[sessionId]/expire — best-effort: records that ConfirmationBar's own countdown lapsed with no reply. No mutation executes. */
export function useExpireVoiceTurn() {
  return useMutation({
    mutationFn: async (sessionId: string) =>
      (await apiFetch<VoiceExpireResult>(`/api/voice/${sessionId}/expire`, { method: "POST" })).data,
  });
}
