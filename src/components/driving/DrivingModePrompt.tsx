"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useIsStandalone } from "@/hooks/useIsStandalone";

/**
 * Shown once per app launch (this component's own useState resets on every
 * full reload, which is exactly "ask every launch" -- no persistence, no
 * other component reads this state, so no Context/Provider is needed).
 */
export function DrivingModePrompt() {
  const router = useRouter();
  const isStandalone = useIsStandalone();
  const [dismissed, setDismissed] = useState(false);

  return (
    <Dialog open={isStandalone && !dismissed} onClose={() => setDismissed(true)} title="Are you driving?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Switch to Driving Mode for bigger text, bigger buttons, and a simplified queue you can page through at a
          glance.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            className="flex-1 py-3 text-base"
            onClick={() => {
              setDismissed(true);
              router.push("/driving");
            }}
          >
            Yes, I&apos;m driving
          </Button>
          <Button variant="secondary" className="flex-1 py-3 text-base" onClick={() => setDismissed(true)}>
            No
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
