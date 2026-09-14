"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearFaceIdCredential,
  hasFaceIdCredential,
  isFaceIdLockSupported,
  registerFaceIdCredential,
} from "@/lib/webauthn/faceIdLock";

type UseFaceIdLockResult = {
  isSupported: boolean;
  isEnabled: boolean;
  isBusy: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => void;
};

/** Per-device, per-account toggle for the Face ID quick-unlock gate -- see lib/webauthn/faceIdLock.ts. */
export function useFaceIdLock(userId: string, email: string): UseFaceIdLockResult {
  const [isSupported, setIsSupported] = useState(false);
  // Synchronous and SSR-safe (see hasFaceIdCredential's typeof window guard) --
  // computed directly as initial state rather than via an effect, matching
  // useLocalStorage's convention elsewhere in this codebase.
  const [isEnabled, setIsEnabled] = useState(() => hasFaceIdCredential(userId));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    isFaceIdLockSupported().then((supported) => {
      if (!cancelled) setIsSupported(supported);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    setIsBusy(true);
    setError(null);
    try {
      await registerFaceIdCredential(userId, email);
      setIsEnabled(true);
      return true;
    } catch {
      setError("Couldn't set up Face ID on this device.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [userId, email]);

  const disable = useCallback(() => {
    clearFaceIdCredential(userId);
    setIsEnabled(false);
  }, [userId]);

  return { isSupported, isEnabled, isBusy, error, enable, disable };
}
