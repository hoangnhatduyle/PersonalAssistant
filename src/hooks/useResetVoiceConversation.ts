import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { useVoiceCapture } from "@/components/assistant/VoiceCaptureProvider";

export interface VoiceConversationResetResult {
  ok: true;
}

/**
 * POST /api/voice/conversation/reset — the UI-button trigger for ending the
 * active conversation (a natural-language start_new_conversation tool is
 * the other trigger; both funnel through the same server-side
 * endConversation call). Silent per the user's decision: on success this
 * only clears the visible transcript/response locally, no toast.
 */
export function useResetVoiceConversation() {
  const { reset } = useVoiceCapture();
  return useMutation({
    mutationFn: async () =>
      (await apiFetch<VoiceConversationResetResult>("/api/voice/conversation/reset", { method: "POST" })).data,
    onSuccess: () => {
      reset();
    },
  });
}
