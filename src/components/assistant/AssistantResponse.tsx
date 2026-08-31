import { CitationChips } from "@/components/assistant/CitationChips";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { VoiceTurnResult } from "@/lib/voice/session";

type Props = {
  message: string;
  citations?: VoiceTurnResult["citations"];
  extractionLabel?: VoiceTurnResult["extractionLabel"];
  /** SPEC-API-010: set only for a voice-originated response. Both default unused so text-originated rendering is byte-for-byte unchanged. */
  isSpeaking?: boolean;
  onReplay?: () => void;
};

export function AssistantResponse({ message, citations, extractionLabel, isSpeaking, onReplay }: Props) {
  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="text-sm text-text-primary">{message}</p>
      {extractionLabel === "machine_extracted" && (
        <p className="font-mono text-xs text-text-eyebrow">
          Drawn from machine-extracted document text — may contain errors.
        </p>
      )}
      {citations && citations.length > 0 && <CitationChips citations={citations} />}
      {onReplay && (
        <div className="flex items-center gap-2">
          {isSpeaking && <span className="font-mono text-xs text-text-secondary">🔊 Speaking…</span>}
          <button type="button" onClick={onReplay} className="font-mono text-xs text-accent-indigo hover:underline">
            Replay
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
