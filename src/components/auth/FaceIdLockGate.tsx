"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasFaceIdCredential, verifyFaceIdCredential } from "@/lib/webauthn/faceIdLock";
import { Button } from "@/components/ui/Button";

type Props = {
  userId: string;
  children: ReactNode;
};

type LockState = "checking" | "unlocked" | "locked" | "unlocking";

/**
 * Wraps the authenticated app shell. If this device has no Face ID
 * credential registered (see the settings toggle), it's a no-op pass-
 * through. Otherwise it shows a lock screen on first mount and again every
 * time the tab/PWA comes back from being hidden, independent of the
 * Supabase session itself -- the session (cookie-based) stays valid the
 * whole time, this only gates whether the UI reveals it.
 */
export function FaceIdLockGate({ userId, children }: Props) {
  const router = useRouter();
  const [state, setState] = useState<LockState>("checking");
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    // Deliberately deferred to a post-mount effect rather than computed as
    // initial state: hasFaceIdCredential reads localStorage, which doesn't
    // exist during SSR, so a lazy useState initializer would resolve to
    // "unlocked" server-side and ship the real app markup unprotected in
    // the HTML response before this component ever gets a chance to hide
    // it. Staying in "checking" (renders nothing) until this effect runs
    // client-side avoids that leak, at the cost of this one-time setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(hasFaceIdCredential(userId) ? "locked" : "unlocked");
  }, [userId]);

  useEffect(() => {
    if (!hasFaceIdCredential(userId)) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState === "visible" && wasHiddenRef.current) {
        wasHiddenRef.current = false;
        setState("locked");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [userId]);

  const handleUnlock = useCallback(async () => {
    setState("unlocking");
    const success = await verifyFaceIdCredential(userId);
    setState(success ? "unlocked" : "locked");
  }, [userId]);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
  }, [router]);

  if (state === "checking") {
    return <div className="min-h-screen bg-bg-void" />;
  }

  if (state === "unlocked") {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg-void p-6 text-center">
      <div className="flex flex-col gap-2">
        <p className="font-display text-xl font-semibold text-text-primary">Cadence is locked</p>
        <p className="text-sm text-text-secondary">Unlock with Face ID to continue.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button variant="primary" className="w-full" onClick={handleUnlock} isLoading={state === "unlocking"}>
          Unlock with Face ID
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleSignOut}>
          Use password instead
        </Button>
      </div>
    </div>
  );
}
