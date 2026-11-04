"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAfterMutation } from "@/hooks/useVoiceTurn";
import { SILENT_WAV, unlockAudioPlayback } from "@/lib/voice/play-audio";
import { CallController, type CallControllerDeps, type CallSnapshot } from "@/lib/voice/realtime/call-controller";

/**
 * The browser wiring for CallController: the real fetch, microphone, peer
 * connection, audio element, wake lock and beacon. Everything with logic lives
 * in the controller (and is tested there); this only supplies the globals and
 * ties the call to the page's lifecycle.
 */

function browserDeps(): CallControllerDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createPeerConnection: () => new RTCPeerConnection(),
    createAudioElement: () => {
      // Created and "played" inside the tap that starts the call. On iOS an element only plays a
      // stream later if it was started by a user gesture, so it plays silence now and the call's
      // audio replaces it when the connection comes up.
      const audio = new Audio();
      audio.setAttribute("playsinline", "true");
      audio.src = SILENT_WAV;
      void audio.play().then(() => audio.pause()).catch(() => undefined);
      return audio;
    },
    unlockAudio: unlockAudioPlayback,
    requestWakeLock: async () => ("wakeLock" in navigator ? await navigator.wakeLock.request("screen") : null),
    sendBeacon: (url, data) => navigator.sendBeacon(url, data),
  };
}

export interface UseRealtimeCall {
  snapshot: CallSnapshot;
  /** Call straight from a click handler (see CallController.start). */
  start: () => void;
  end: () => void;
  setMuted: (muted: boolean) => void;
  /** Ask the assistant something with a button instead of a voice (see CallController.sendUserText). */
  sendText: (text: string) => void;
  /** The user answered a pending change with the on-screen button; tell the model. */
  reportScreenDecision: (decision: { outcome: "executed" | "declined"; summary: string }) => void;
}

export function useRealtimeCall(): UseRealtimeCall {
  const queryClient = useQueryClient();
  // Constructing the controller touches no browser API; those are reached only when a call starts.
  const [controller] = useState(() => new CallController(browserDeps()));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  // A call nobody can hear is only cost: leave it when the app goes to the background, and
  // report the end reliably when the page is closed or hidden for good.
  useEffect(() => {
    const onVisibility = () => controller.setHidden(document.visibilityState === "hidden");
    const onPageHide = () => controller.end("hidden", undefined, { beacon: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving the screen ends a live call. An idle controller is left alone, so React Strict
      // Mode's mount-unmount-mount in development doesn't mark it ended before it ever started.
      const { phase } = controller.getSnapshot();
      if (phase === "connecting" || phase === "live") controller.end("user");
    };
  }, [controller]);

  // A change confirmed during the call (by voice or by tap) makes the app's cached lists stale.
  const hadPending = useRef(false);
  useEffect(() => {
    const hasPending = snapshot.pending !== null;
    if (hadPending.current && !hasPending) invalidateAfterMutation(queryClient);
    hadPending.current = hasPending;
  }, [snapshot.pending, queryClient]);
  useEffect(() => {
    if (snapshot.phase === "ended") invalidateAfterMutation(queryClient);
  }, [snapshot.phase, queryClient]);

  const start = useCallback(() => void controller.start(), [controller]);
  const end = useCallback(() => controller.end("user"), [controller]);
  const setMuted = useCallback((muted: boolean) => controller.setMuted(muted), [controller]);
  const sendText = useCallback((text: string) => controller.sendUserText(text), [controller]);
  const reportScreenDecision = useCallback<UseRealtimeCall["reportScreenDecision"]>((decision) => controller.reportScreenDecision(decision), [controller]);

  return { snapshot, start, end, setMuted, sendText, reportScreenDecision };
}
