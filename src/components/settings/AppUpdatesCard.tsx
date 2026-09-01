"use client";

// App updates (PWA): an installed PWA keeps running whatever bundle it
// loaded until the tab is closed and reopened, so a stale install can
// silently miss a deploy. These two actions replace "uninstall and
// reinstall the app" as the fix.
import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

export function AppUpdatesCard() {
  const [checking, setChecking] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { showToast } = useToast();

  const checkForUpdates = async () => {
    if (!("serviceWorker" in navigator)) {
      showToast("Updates aren't available in this browser", "error");
      return;
    }
    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      window.location.reload();
    } catch {
      showToast("Update check failed — try Refresh & empty cache below", "error");
      setChecking(false);
    }
  };

  const refreshAndEmptyCache = async () => {
    setConfirmOpen(false);
    setClearing(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      window.location.reload();
    } catch {
      showToast("Couldn't clear the cache — try closing and reopening the app", "error");
      setClearing(false);
    }
  };

  return (
    <GlassPanel className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="font-display text-sm font-medium text-text-primary">App updates</p>
        <p className="text-xs text-text-secondary">
          Installed as an app, Cadence keeps running the version it had when it was last refreshed. If something
          looks out of date, try these instead of removing and re-adding it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-panel-border pb-4">
        <div className="flex items-center gap-3">
          <RefreshIcon />
          <div>
            <p className="text-sm font-medium text-text-primary">Check for updates</p>
            <p className="text-xs text-text-secondary">Fetch and apply the latest version if one is available</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={checkForUpdates} disabled={checking || clearing}>
          {checking ? "Checking…" : "Check"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <TrashIcon />
          <div>
            <p className="text-sm font-medium text-text-primary">Empty cache and refresh</p>
            <p className="text-xs text-text-secondary">Force a full reload and clear everything stored offline</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={checking || clearing}
        >
          {clearing ? "Clearing…" : "Refresh"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={refreshAndEmptyCache}
        title="Empty cache and refresh?"
        description="This reloads the app and clears everything stored offline. Any unsaved changes on this page will be lost."
        confirmLabel="Refresh"
        destructive={false}
      />
    </GlassPanel>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true">
      <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4.6 15a8 8 0 0 0 14.03 2.6M19.4 9a8 8 0 0 0-14.03-2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}
