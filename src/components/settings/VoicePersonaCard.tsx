"use client";

import { useRef, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useToast } from "@/components/ui/Toast";
import { VOICE_PERSONA_IDS, VOICE_PERSONAS, voicePersonaSampleUrl, type VoicePersonaId } from "@/lib/voice/realtime/personas";

/**
 * Picks the voice and speaking style the live call uses. Saved on select, like
 * the other preference cards. A call already in progress keeps the voice it
 * started with, so the change is heard from the next call.
 */
export function VoicePersonaCard() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<VoicePersonaId | null>(null);

  // One shared element, so starting a sample stops the one before it. Tapping
  // the playing sample stops it. A clip that fails to play just resets the button.
  const togglePreview = (id: VoicePersonaId) => {
    audioRef.current ??= new Audio();
    const audio = audioRef.current;
    audio.pause();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    audio.src = voicePersonaSampleUrl(id);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    setPlayingId(id);
    audio.play().catch(() => setPlayingId(null));
  };

  const handleSelect = async (id: VoicePersonaId) => {
    if (data?.voice_persona === id) return;
    try {
      await updateSettings.mutateAsync({ voice_persona: id });
      showToast(`Call voice set to ${VOICE_PERSONAS[id].label}`, "success");
    } catch {
      showToast("Could not save that change", "error");
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-2 p-4 sm:col-span-2 lg:col-span-3">
      <p className="font-display text-sm font-medium text-text-primary">Call voice</p>
      <p className="text-xs text-text-secondary">
        Choose how the assistant sounds and speaks on a call. It takes effect from your next call.
      </p>
      {isError ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-status-urgent">Couldn&apos;t load this setting.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div role="radiogroup" aria-label="Call voice" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {VOICE_PERSONA_IDS.map((id) => {
            const persona = VOICE_PERSONAS[id];
            const selected = data.voice_persona === id;
            return (
              <div
                key={id}
                className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-accent-indigo/50 ${
                  selected ? "border-accent-indigo bg-accent-indigo/10" : "border-panel-border hover:bg-bg-void-elevated"
                } ${updateSettings.isPending ? "opacity-70" : ""}`}
              >
                <label className="flex cursor-pointer flex-col gap-1">
                  <input
                    type="radio"
                    name="voice-persona"
                    value={id}
                    checked={selected}
                    onChange={() => handleSelect(id)}
                    disabled={updateSettings.isPending}
                    className="sr-only"
                  />
                  <span className="font-display text-sm font-medium text-text-primary">{persona.label}</span>
                  <span className="text-xs text-text-secondary">{persona.description}</span>
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  aria-label={`${playingId === id ? "Stop" : "Play"} ${persona.label} sample`}
                  onClick={() => togglePreview(id)}
                >
                  {playingId === id ? "Stop" : "Play sample"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
