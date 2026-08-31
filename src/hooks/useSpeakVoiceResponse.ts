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
 * Callers must use `.speak(text)` (a thin `.mutate()` wrapper), not
 * `.mutateAsync()` directly — code-review finding: `mutateAsync` rethrows
 * on failure (a 429 from the rate limit, a 500 from the provider) even
 * though `onError` already handles it, so a fire-and-forget
 * `void mutateAsync(...)` call site would still produce an unhandled
 * promise rejection. `.mutate()` never rethrows; failure surfaces only via
 * the toast below, and can never undo an already-applied text response.
 */
export function useSpeakVoiceResponse() {
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const { data } = await apiFetch<VoiceSpeakResponse>("/api/voice/speak", { method: "POST", body: { text } });
      return playBase64Audio(data.audio, data.mimetype);
    },
    onError: () => {
      showToast("Couldn't play that aloud", "error");
    },
  });
  return { ...mutation, speak: mutation.mutate };
}
