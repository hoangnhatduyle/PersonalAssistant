"use client";

import { useCallback, useRef, useState } from "react";
import { CAPTURE_MAX_DURATION_MS, CAPTURE_MIN_SPEECH_MS, CAPTURE_SILENCE_MS, SILENCE_RMS_THRESHOLD } from "@/lib/voice/constants";

export interface UseAutoStopRecorderOptions {
  silenceMs?: number;
  maxDurationMs?: number;
  minSpeechMs?: number;
}

export interface UseAutoStopRecorderResult {
  status: "idle" | "listening";
  start: () => Promise<void>;
  /** Manual early stop — also the internal path auto-stop takes. */
  stop: () => void;
}

/**
 * Tap-to-start recording that auto-stops once speech has been heard and
 * silence then persists for `silenceMs`, or when `maxDurationMs` elapses.
 * No VAD library exists in this repo (checked package.json) — silence
 * detection is hand-rolled via the Web Audio API (AnalyserNode RMS volume)
 * on the same MediaStream the MediaRecorder itself consumes.
 *
 * If no speech is ever detected before maxDurationMs, `onComplete` is never
 * called — the recording is torn down silently instead. This is the safety
 * valve that stops CaptureChannel's hands-free loop from submitting empty
 * turns forever if the user goes quiet.
 */
export function useAutoStopRecorder(onComplete: (blob: Blob) => void, options: UseAutoStopRecorderOptions = {}): UseAutoStopRecorderResult {
  const silenceMs = options.silenceMs ?? CAPTURE_SILENCE_MS;
  const maxDurationMs = options.maxDurationMs ?? CAPTURE_MAX_DURATION_MS;
  const minSpeechMs = options.minSpeechMs ?? CAPTURE_MIN_SPEECH_MS;

  const [status, setStatus] = useState<"idle" | "listening">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const lastLoudAtRef = useRef(0);
  const startedAtRef = useRef(0);

  const teardownAnalysis = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    teardownAnalysis();
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setStatus("idle");
  }, [teardownAnalysis]);

  const start = useCallback(async () => {
    if (mediaRecorderRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const mimeType = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    chunksRef.current = [];
    hasSpokenRef.current = false;
    startedAtRef.current = Date.now();
    lastLoudAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (hasSpokenRef.current) {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        onComplete(blob);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setStatus("listening");

    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.fftSize);
      volumeIntervalRef.current = setInterval(() => {
        const currentAnalyser = analyserRef.current;
        if (!currentAnalyser) return;
        currentAnalyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const now = Date.now();
        if (rms > SILENCE_RMS_THRESHOLD) {
          lastLoudAtRef.current = now;
          hasSpokenRef.current = true;
        }
        const elapsedSinceStart = now - startedAtRef.current;
        if (hasSpokenRef.current && elapsedSinceStart >= minSpeechMs && now - lastLoudAtRef.current >= silenceMs) {
          stop();
        }
      }, 100);
    }

    maxTimerRef.current = setTimeout(stop, maxDurationMs);
  }, [minSpeechMs, silenceMs, maxDurationMs, stop, onComplete]);

  return { status, start, stop };
}
