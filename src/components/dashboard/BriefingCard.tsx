"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/hooks/useSettings";
import { useSpeakVoiceResponse } from "@/hooks/useSpeakVoiceResponse";
import { apiFetch } from "@/lib/http/client";
import type { BriefingResponse } from "@/app/api/briefing/route";

const CACHE_KEY = "cadence.briefing";

interface CachedBriefing {
  briefing: string;
  date: string;
}

function getCachedBriefing(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBriefing;
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedBriefing(data: CachedBriefing) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be full or disabled
  }
}

export function BriefingCard() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);
  const { data: settings } = useSettings();
  const { speak, isPending: isSpeaking } = useSpeakVoiceResponse();

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await apiFetch<BriefingResponse>("/api/briefing", { method: "POST" });
      setBriefing(data.briefing);
      setCachedBriefing({ briefing: data.briefing, date: data.date });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedBriefing();
    if (cached) {
      setBriefing(cached.briefing);
      return;
    }
    fetchBriefing();
  }, [fetchBriefing]);

  if (dismissed) return null;

  const voiceEnabled = settings?.voice_capture_enabled ?? false;

  return (
    <GlassPanel variant="glow-ok" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wide text-accent-teal">Morning Briefing</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Dismiss briefing"
        >
          Dismiss
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Could not load your briefing.</p>
          <Button size="sm" variant="secondary" onClick={fetchBriefing}>
            Retry
          </Button>
        </div>
      ) : briefing ? (
        <>
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">{briefing}</p>
          <div className="flex items-center gap-2">
            {voiceEnabled && (
              <Button size="sm" variant="secondary" isLoading={isSpeaking} onClick={() => speak(briefing)}>
                Read aloud
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={fetchBriefing}>
              Refresh
            </Button>
          </div>
        </>
      ) : null}
    </GlassPanel>
  );
}
