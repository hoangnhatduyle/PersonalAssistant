import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { playBase64Audio } from "@/lib/voice/play-audio";
import { useToast } from "@/components/ui/Toast";
import type { VoiceSpeakResponse } from "@/app/api/voice/speak/route";

/**
 * POST /api/voice/speak, then plays the returned audio back. SPEC-API-010:
 * only ever called for a microphone-originated turn — callers gate that
 * themselves.
 *
 * Returns `{ played: boolean }` so callers can act on playback failures
 * (e.g. skip hands-free mic re-arm on mobile autoplay blocks).
 */
export function useSpeakVoiceResponse() {
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const { data } = await apiFetch<VoiceSpeakResponse>("/api/voice/speak", { method: "POST", body: { text } });
      const result = await playBase64Audio(data.audio, data.mimetype);
      if (!result.played) {
        showToast("Tap Replay to hear the response", "info");
      }
      return result;
    },
    onError: () => {
      showToast("Couldn't play that aloud", "error");
    },
  });
  return { ...mutation, speak: mutation.mutate, isPending: mutation.isPending };
}
