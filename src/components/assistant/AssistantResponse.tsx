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

function SpeakerWaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" strokeLinecap="round" />
    </svg>
  );
}

export function AssistantResponse({ message, citations, extractionLabel, isSpeaking, onReplay }: Props) {
  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="text-sm text-text-primary">{message}</p>
      {extractionLabel === "machine_extracted" && (
        <p className="text-xs text-text-eyebrow">
          Drawn from machine-extracted document text — may contain errors.
        </p>
      )}
      {citations && citations.length > 0 && <CitationChips citations={citations} />}
      {onReplay && (
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <span className="flex items-center gap-1 text-xs text-text-secondary">
              <SpeakerWaveIcon />
              Speaking…
            </span>
          )}
          <button type="button" onClick={onReplay} className="text-xs text-accent-indigo hover:underline">
            Replay
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
