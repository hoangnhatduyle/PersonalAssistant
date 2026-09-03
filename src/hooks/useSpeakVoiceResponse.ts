import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/client";
import { playBase64Audio } from "@/lib/voice/play-audio";
import { useToast } from "@/components/ui/Toast";
import { MAX_SPEAK_TEXT_CHARS } from "@/lib/voice/constants";
import type { VoiceSpeakResponse } from "@/app/api/voice/speak/route";

/**
 * Defensive safety net for POST /api/voice/speak's MAX_SPEAK_TEXT_CHARS cap
 * (src/lib/api/schemas.ts's voiceSpeakSchema rejects, not truncates, an
 * over-limit request — a deliberate, tested contract, not something to
 * silently change server-side). The conversational core (src/lib/voice/
 * conversation-core.ts) is prompted to stay concise, but that's not a hard
 * guarantee — e.g. narrating many same-day schedule items in full can run
 * long — so a rare verbose response must degrade to "speak the first part"
 * instead of silently failing playback while the full text still displays
 * fine in the UI. Cuts at the last sentence boundary under the limit when
 * that doesn't discard more than half the text, else the last word
 * boundary, so the spoken audio never ends mid-word.
 */
function truncateForSpeech(text: string): string {
  if (text.length <= MAX_SPEAK_TEXT_CHARS) return text;
  const truncated = text.slice(0, MAX_SPEAK_TEXT_CHARS);
  const lastSentenceEnd = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("! "), truncated.lastIndexOf("? "));
  if (lastSentenceEnd > MAX_SPEAK_TEXT_CHARS * 0.5) return truncated.slice(0, lastSentenceEnd + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

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
      const { data } = await apiFetch<VoiceSpeakResponse>("/api/voice/speak", { method: "POST", body: { text: truncateForSpeech(text) } });
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
