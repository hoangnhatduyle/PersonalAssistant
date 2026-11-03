"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { useCallDiagnostics } from "@/hooks/useCallDiagnostics";

export function CallDiagnosticsToggleCard() {
  const [enabled, setEnabled] = useCallDiagnostics();

  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="font-display text-sm font-medium text-text-primary">Call diagnostics</p>
      <p className="text-xs text-text-secondary">
        Show connection details, reply latency and token use on the Driving Mode voice call. For testing; this
        device only.
      </p>
      <Checkbox
        label="Show call diagnostics on this device"
        aria-label="Call diagnostics"
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
    </GlassPanel>
  );
}
