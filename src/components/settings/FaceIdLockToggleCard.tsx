"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Checkbox } from "@/components/ui/Checkbox";
import { useFaceIdLock } from "@/hooks/useFaceIdLock";
import { useToast } from "@/components/ui/Toast";

type Props = {
  userId: string;
  userEmail: string;
};

export function FaceIdLockToggleCard({ userId, userEmail }: Props) {
  const { isSupported, isEnabled, isBusy, error, enable, disable } = useFaceIdLock(userId, userEmail);
  const { showToast } = useToast();

  const handleChange = async (checked: boolean) => {
    if (checked) {
      const success = await enable();
      showToast(
        success ? "Face ID quick-unlock enabled on this device" : "Couldn't set up Face ID on this device",
        success ? "success" : "error",
      );
      return;
    }
    disable();
    showToast("Face ID quick-unlock disabled", "success");
  };

  return (
    <GlassPanel className="flex flex-col gap-2 p-4">
      <p className="font-display text-sm font-medium text-text-primary">Face ID quick-unlock</p>
      <p className="text-xs text-text-secondary">
        Require Face ID to reopen Cadence on this device. This only locks the screen locally -- it doesn&apos;t
        replace your account password and isn&apos;t linked to your other devices.
      </p>
      {!isSupported ? (
        <p className="text-xs text-text-secondary">Not available on this device or browser.</p>
      ) : (
        <Checkbox
          label={isEnabled ? "Enabled on this device" : "Enable on this device"}
          aria-label="Face ID quick-unlock enabled"
          checked={isEnabled}
          onChange={(event) => handleChange(event.target.checked)}
          disabled={isBusy}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-status-urgent">
          {error}
        </p>
      )}
    </GlassPanel>
  );
}
