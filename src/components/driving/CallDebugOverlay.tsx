import { GlassPanel } from "@/components/ui/GlassPanel";
import type { CallDebug } from "@/lib/voice/realtime/call-controller";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** What the browser actually gave the call, and how it is performing (`?debug=1` or the Settings toggle). */
export function CallDebugOverlay({ debug }: { debug: CallDebug }) {
  const latency = median(debug.responseLatenciesMs);
  const cachedShare = debug.usage.inputTokens > 0 ? Math.round((debug.usage.cachedInputTokens / debug.usage.inputTokens) * 100) : null;
  return (
    <GlassPanel className="grid gap-1 p-3 font-mono text-xs text-text-secondary">
      <p>
        connection {debug.connectionState} · ice {debug.iceConnectionState} · wake lock {debug.wakeLockActive ? "on" : "off"}
      </p>
      <p>
        mic {debug.micSettings ? `${debug.micSettings.sampleRate ?? "?"} Hz · echo ${String(debug.micSettings.echoCancellation)} · noise ${String(debug.micSettings.noiseSuppression)} · agc ${String(debug.micSettings.autoGainControl)}` : "—"}
      </p>
      <p>
        reply latency {latency === null ? "—" : `${latency} ms median`} ({debug.responseLatenciesMs.length} samples
        {debug.responseLatenciesMs.length > 0 ? `, last ${debug.responseLatenciesMs.at(-1)} ms` : ""})
      </p>
      <p>
        tokens in {debug.usage.inputTokens} (cached {cachedShare === null ? "—" : `${cachedShare}%`}) · out {debug.usage.outputTokens}
      </p>
    </GlassPanel>
  );
}
